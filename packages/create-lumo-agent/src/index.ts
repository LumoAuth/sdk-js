import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import prompts from 'prompts';
import kleur from 'kleur';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

interface Args {
  projectName?: string;
  template?: string;
  install: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { install: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-install') args.install = false;
    else if (a === '--template' || a === '-t') args.template = argv[++i];
    else if (!a.startsWith('-') && !args.projectName) args.projectName = a;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log();
  console.log(kleur.bold().cyan('LumoAuth') + kleur.gray(' · agent starter'));
  console.log();

  const availableTemplates = readdirSync(TEMPLATES_DIR).filter((d) =>
    statSync(join(TEMPLATES_DIR, d)).isDirectory(),
  );

  const responses = await prompts(
    [
      {
        type: args.projectName ? null : 'text',
        name: 'projectName',
        message: 'Project name',
        initial: 'my-agent',
        validate: (v: string) => (/^[a-z0-9][a-z0-9-]*$/.test(v) ? true : 'lowercase letters, digits, and dashes only'),
      },
      {
        type: args.template || availableTemplates.length === 1 ? null : 'select',
        name: 'template',
        message: 'Template',
        choices: availableTemplates.map((t) => ({ title: t, value: t })),
        initial: 0,
      },
      {
        type: 'text',
        name: 'domain',
        message: 'LumoAuth domain (root host, not the /orgs/… path)',
        initial: 'https://app.lumoauth.dev',
        validate: (v: string) => (/^https?:\/\//.test(v) ? true : 'must be a URL'),
      },
      {
        type: 'text',
        name: 'orgId',
        message: 'Organization id (e.g. acme-corp)',
        initial: 'your-org',
      },
      {
        type: 'text',
        name: 'clientId',
        message: 'OAuth client_id (paste from your LumoAuth dashboard, or leave blank to fill later)',
        initial: '',
      },
    ],
    { onCancel: () => process.exit(1) },
  );

  const projectName = args.projectName ?? responses.projectName;
  const template = args.template ?? responses.template ?? availableTemplates[0];
  const domain = responses.domain ?? 'https://app.lumoauth.dev';
  const orgId = responses.orgId ?? 'your-org';
  const clientId = responses.clientId ?? '';

  const projectDir = resolve(process.cwd(), projectName);
  if (existsSync(projectDir) && readdirSync(projectDir).length > 0) {
    console.error(kleur.red(`error: ${projectName}/ already exists and is not empty`));
    process.exit(1);
  }

  const templateDir = join(TEMPLATES_DIR, template);
  if (!existsSync(templateDir)) {
    console.error(kleur.red(`error: template "${template}" not found in ${TEMPLATES_DIR}`));
    process.exit(1);
  }

  console.log();
  console.log(kleur.gray(`scaffolding ${projectName}/ from ${template}…`));
  copyDir(templateDir, projectDir, { projectName, domain, orgId, clientId });
  console.log(kleur.green('✓') + ' files written');

  if (args.install) {
    console.log(kleur.gray('installing dependencies (this can take a minute)…'));
    const r = spawnSync('npm', ['install'], { cwd: projectDir, stdio: 'inherit' });
    if (r.status !== 0) {
      console.warn(kleur.yellow('npm install failed; you can run it manually'));
    } else {
      console.log(kleur.green('✓') + ' dependencies installed');
    }
  }

  console.log();
  console.log(kleur.bold('Next steps:'));
  console.log();
  console.log(`  ${kleur.cyan('cd')} ${projectName}`);
  if (!args.install) console.log(`  ${kleur.cyan('npm install')}`);
  console.log(`  ${kleur.cyan('npm run dev')}`);
  console.log();
  console.log(kleur.gray('Then visit ') + kleur.cyan('http://localhost:3000') + kleur.gray(' to see your agent in action.'));
  console.log();
  console.log(kleur.gray('Docs: ') + kleur.cyan('https://docs.lumoauth.dev/quickstarts/create-lumo-agent'));
  console.log();
}

interface Vars {
  projectName: string;
  domain: string;
  orgId: string;
  clientId: string;
}

function copyDir(src: string, dst: string, vars: Vars) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const sp = join(src, entry);
    const dp = join(dst, entry === 'gitignore' ? '.gitignore' : entry);
    const stat = statSync(sp);
    if (stat.isDirectory()) {
      copyDir(sp, dp, vars);
    } else {
      let body = readFileSync(sp, 'utf8');
      if (/\.(json|ts|tsx|js|jsx|md|mdx|env|html)$/.test(entry) || entry === 'package.json' || entry === '.env.example') {
        body = body
          .replace(/\{\{projectName\}\}/g, vars.projectName)
          .replace(/\{\{domain\}\}/g, vars.domain)
          .replace(/\{\{orgId\}\}/g, vars.orgId)
          .replace(/\{\{clientId\}\}/g, vars.clientId);
      }
      writeFileSync(dp, body);
    }
  }
}

main().catch((e) => {
  console.error(kleur.red('failed:'), e);
  process.exit(1);
});
