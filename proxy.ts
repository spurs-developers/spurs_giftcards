import { createSpursProxy } from "@spurs-cloud/accounts/next";

// Gate the gift card app behind the shared Spurs session. The landing page, sign-in
// bounce and the private service API stay public.
export const proxy = createSpursProxy({
  publicPaths: ["/", "/login", "/auth/", "/api/private/"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
