'use client';

import { useAuth } from '@lumoauth/react';

export default function SignUpPage() {
    const { signUp } = useAuth();

    return (
        <>
            <h1>Sign up</h1>
            <p className="lede">Registration hands off to the hosted page.</p>

            <div className="card">
                <button
                    className="primary"
                    data-testid="signup"
                    onClick={() =>
                        signUp({ email: '', password: '' }).catch((e) => alert(e.message))
                    }
                >
                    Create an account
                </button>
            </div>

            <p className="note warn">
                <b>There is no inline registration.</b> The server exposes registration only as a
                server-rendered form, so there is no JSON endpoint that can create an account and return
                tokens. In PKCE mode <code>signUp()</code> redirects to the hosted register page; in password
                mode it throws with that explanation rather than silently posting into a 404.
                <br />
                <br />
                This is why the <code>&lt;SignUp /&gt;</code> component is not used here: rendering a form
                that cannot submit would be worse than an honest redirect.
            </p>
        </>
    );
}
