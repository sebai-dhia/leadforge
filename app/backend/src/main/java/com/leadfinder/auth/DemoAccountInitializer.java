package com.leadfinder.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Creates the admin account on startup if it is not present, and applies ADMIN_PASSWORD when it is set.
 * Without ADMIN_PASSWORD a new admin gets a random password, printed once in the log.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DemoAccountInitializer implements ApplicationRunner {
    static final String ADMIN_EMAIL = "admin@leadforge.dev";
    /** The password the admin was first created with. Never acceptable outside a developer's machine. */
    private static final String OLD_DEFAULT = "admin1234";

    private final UserRepository users;
    private final PasswordEncoder encoder;

    @Value("${app.admin.password:}")
    private String adminPassword;

    @Override
    public void run(ApplicationArguments args) {
        String wanted = adminPassword == null ? "" : adminPassword.trim();
        if (!wanted.isEmpty() && wanted.length() < 12) {
            log.warn("ADMIN_PASSWORD is shorter than 12 characters; it was not applied.");
            wanted = "";
        }
        AppUser admin = users.findByEmail(ADMIN_EMAIL).orElse(null);
        if (admin == null) {
            String password = wanted.isEmpty() ? randomPassword() : wanted;
            seedAdmin(password);
            if (wanted.isEmpty()) log.warn("Admin account created with a random password: {}  Set ADMIN_PASSWORD to choose one.", password);
            return;
        }
        if (!wanted.isEmpty() && !encoder.matches(wanted, admin.getPasswordHash())) {
            admin.setPasswordHash(encoder.encode(wanted));
            users.save(admin);
            log.info("Admin password updated from ADMIN_PASSWORD.");
        } else if (wanted.isEmpty() && admin.getPasswordHash() != null && encoder.matches(OLD_DEFAULT, admin.getPasswordHash())) {
            log.warn("The admin still uses the old default password. Set ADMIN_PASSWORD (12+ characters) and restart.");
        }
    }

    private void seedAdmin(String password) {
        AppUser user = new AppUser();
        user.setEmail(ADMIN_EMAIL);
        user.setPasswordHash(encoder.encode(password));
        user.setRole("ADMIN");
        user.setDemo(false);
        user.setOffer("Full-Stack Custom Software & Web Automation");
        user.setDisplayName("Admin");
        user.setLanguage("en");
        users.save(user);
        log.info("Seeded account: {} (ADMIN)", ADMIN_EMAIL);
    }

    private static String randomPassword() {
        byte[] b = new byte[18];
        new SecureRandom().nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
}
