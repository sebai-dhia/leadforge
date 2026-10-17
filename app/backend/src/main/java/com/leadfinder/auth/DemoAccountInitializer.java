package com.leadfinder.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the default admin account on startup if it is not present.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DemoAccountInitializer implements ApplicationRunner {

    private final UserRepository users;
    private final PasswordEncoder encoder;

    @Override
    public void run(ApplicationArguments args) {
        seedAccount("admin@leadforge.dev", "admin1234", "ADMIN", false,
                "Full-Stack Custom Software & Web Automation", "Admin", "en");
    }

    private void seedAccount(String email, String password, String role, boolean isDemo,
                             String offer, String displayName, String language) {
        if (users.existsByEmail(email)) return;
        AppUser user = new AppUser();
        user.setEmail(email);
        user.setPasswordHash(encoder.encode(password));
        user.setRole(role);
        user.setDemo(isDemo);
        user.setOffer(offer);
        user.setDisplayName(displayName);
        user.setLanguage(language);
        users.save(user);
        log.info("Seeded account: {} ({})", email, role);
    }
}
