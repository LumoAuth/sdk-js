import { LumoAuthProviderProps } from '@lumoauth/react';
export * from '@lumoauth/react';
import * as react$1 from 'react';

type LumoAuthNextProviderProps = Omit<LumoAuthProviderProps, 'storage'> & {
    /** Base path where createRouteHandler is mounted. @default '/api/auth' */
    basePath?: string;
};
/**
 * Provider wired to the server-side session.
 *
 * The plain `<LumoAuthProvider>` keeps tokens in web storage, which the server
 * cannot see — so a page always renders signed-out first and corrects itself
 * after hydration. This one reads the session from the httpOnly cookie via the
 * route handler, matching what `auth()` already rendered on the server.
 */
declare function LumoAuthNextProvider({ basePath, children, ...rest }: LumoAuthNextProviderProps): react$1.JSX.Element;

export { LumoAuthNextProvider };
