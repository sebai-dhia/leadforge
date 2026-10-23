package com.leadfinder.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/** The rules a new password must follow. Same minimum as the sign-in form; the leaked-password check does the rest. */
@Component
@RequiredArgsConstructor
public class PasswordPolicy {

    static final int MIN_LENGTH = 8;
    /** BCrypt only reads the first 72 bytes: anything after them would be silently ignored. */
    static final int MAX_BYTES = 72;

    /** Why a password was refused; the web app shows a message for each. */
    public enum Problem { TOO_SHORT, TOO_LONG, SAME_AS_EMAIL, LEAKED }

    public static class Rejected extends RuntimeException {
        private final Problem problem;

        public Rejected(Problem problem) {
            super(problem.name());
            this.problem = problem;
        }

        public Problem problem() {
            return problem;
        }
    }

    private final PwnedPasswords pwned;

    public void check(String password, String email) {
        if (password == null || password.codePointCount(0, password.length()) < MIN_LENGTH) throw new Rejected(Problem.TOO_SHORT);
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new Rejected(Problem.TOO_LONG);
        String local = email == null ? "" : email.split("@")[0];
        if (password.equalsIgnoreCase(email) || (local.length() >= 4 && password.toLowerCase().contains(local.toLowerCase()))) {
            throw new Rejected(Problem.SAME_AS_EMAIL);
        }
        if (pwned.isPwned(password)) throw new Rejected(Problem.LEAKED);
    }
}
