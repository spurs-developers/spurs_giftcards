"use client";

import { SpursAccountMenu } from "@spurs-cloud/accounts/react";

/**
 * The shared Spurs account avatar, branded for Gift Cards (violet). The component
 * itself lives in `@spurs-cloud/accounts` so every Spurs app shows the same menu.
 */
export default function AccountMenu({ name, email }: { name?: string; email?: string }) {
  return (
    <SpursAccountMenu
      user={{ name, email }}
      accent="#6d4aff"
      accentTo="#8b6bff"
      signOutUrl="/auth/logout"
    />
  );
}
