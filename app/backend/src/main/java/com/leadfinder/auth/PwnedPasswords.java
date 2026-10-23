package com.leadfinder.auth;

/** Whether a password appears in a known data breach. */
public interface PwnedPasswords {

    /** True when the password is known to have leaked. When the check cannot be made, false: it never blocks a sign-up. */
    boolean isPwned(String password);
}
