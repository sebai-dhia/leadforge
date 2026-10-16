package com.leadfinder.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Initializes the default admin account and the two shared demo accounts on startup if not present.
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

        seedAccount("demo1@leadforge.dev", "demo1234", "DEMO_USER", true,
                "Custom booking systems for small businesses", "Alex Smith (Demo)", "en");

        seedAccount("demo2@leadforge.dev", "demo1234", "DEMO_USER", true,
                "Conception de sites vitrines et refonte web pour commerces locaux", "Claire Dubois (Demo)", "fr");
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
