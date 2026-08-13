"use client";
"use client";

// src/index.ts
export * from "@lumoauth/react";

// src/provider.tsx
import { useMemo } from "react";
import { LumoAuthProvider } from "@lumoauth/react";
import { cookieStorageAdapter } from "@lumoauth/client";
import { jsx } from "react/jsx-runtime";
function LumoAuthNextProvider({
  basePath = "/api/auth",
  children,
  ...rest
}) {
  const storage = useMemo(
    () => cookieStorageAdapter({
      sessionEndpoint: `${basePath}/session`,
      logoutEndpoint: `${basePath}/logout`
    }),
    [basePath]
  );
  return /* @__PURE__ */ jsx(LumoAuthProvider, { ...rest, storage, children });
}
export {
  LumoAuthNextProvider
};
//# sourceMappingURL=index.mjs.map