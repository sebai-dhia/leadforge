package com.leadfinder.auth;

/** Checks a Google ID token and returns who it belongs to. Kept as an interface so tests can replace it. */
public interface GoogleTokenVerifier {

    record GoogleIdentity(String sub, String email, boolean emailVerified, String name) {}

    /** @throws IllegalArgumentException when the token is invalid, expired or issued for another app */
    GoogleIdentity verify(String idToken);
}
