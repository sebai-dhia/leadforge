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
 * Creates the admin account on the first start, from ADMIN_EMAIL and ADMIN_PASSWORD. Without ADMIN_PASSWORD a new
 * admin gets a random password, printed once in the log. After that the account lives in the database and the admin
 * changes the email and password in the app: ADMIN_EMAIL and ADMIN_PASSWORD are not read again, unless
 * ADMIN_PASSWORD_RESET=true (the way back in when the password is lost; turn it off afterwards).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DemoAccountInitializer implements ApplicationRunner {
    static final String DEFAULT_ADMIN_EMAIL = "admin@leadforge.dev";
    /** The password the admin was first created with. Never acceptable outside a developer's machine. */
    private static final String OLD_DEFAULT = "admin1234";
    static final int MIN_PASSWORD = 12;

    private final UserRepository users;
    private final PasswordEncoder encoder;

    @Value("${app.admin.email:}")
    private String adminEmail;

    @Value("${app.admin.password:}")
    private String adminPassword;

    @Value("${app.admin.name:}")
    private String adminName;

    @Value("${app.admin.password-reset:false}")
    private boolean reset;

    @Override
    public void run(ApplicationArguments args) {
        String wanted = adminPassword == null ? "" : adminPassword.trim();
        if (!wanted.isEmpty() && wanted.length() < MIN_PASSWORD) {
            log.warn("ADMIN_PASSWORD is shorter than {} characters; it was not applied.", MIN_PASSWORD);
            wanted = "";
        }
        String email = adminEmail == null ? "" : adminEmail.trim().toLowerCase();
        AppUser admin = users.findFirstByRoleOrderByIdAsc("ADMIN").orElse(null);
        if (admin == null) {
            createAdmin(email.isEmpty() ? DEFAULT_ADMIN_EMAIL : email, wanted);
            return;
        }
        nameAdmin(admin);
        if (reset) {
            resetAdmin(admin, email, wanted);
        } else if (admin.getPasswordHash() != null && encoder.matches(OLD_DEFAULT, admin.getPasswordHash())) {
            log.warn("The admin still uses the old default password. Change it on the Admin page, Settings tab.");
        }
    }

    private void createAdmin(String email, String wantedPassword) {
        if (users.existsByEmail(email)) {
            log.warn("ADMIN_EMAIL {} belongs to a normal account, so no admin was created. Use another address.", email);
            return;
        }
        String password = wantedPassword.isEmpty() ? randomPassword() : wantedPassword;
        AppUser user = new AppUser();
        user.setEmail(email);
        user.setPasswordHash(encoder.encode(password));
        user.setRole("ADMIN");
        user.setDemo(false);
        user.setOffer("Full-Stack Custom Software & Web Automation");
        user.setDisplayName(startName(email));
        user.setLanguage("en");
        users.save(user);
        log.info("Seeded account: {} (ADMIN)", email);
        if (wantedPassword.isEmpty()) {
            log.warn("Admin account created with a random password: {}  Set ADMIN_PASSWORD to choose one, or change it on the Admin page.", password);
        }
    }

    /** The name the admin starts with: ADMIN_NAME, else the part of the email before the @. */
    private String startName(String email) {
        String name = adminName == null ? "" : adminName.trim();
        if (!name.isEmpty()) return name;
        String local = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        return local.isBlank() ? "Admin" : local;
    }

    /** An admin still called "Admin" gets ADMIN_NAME; a name the admin chose on the Profile page is never overwritten. */
    private void nameAdmin(AppUser admin) {
        String name = adminName == null ? "" : adminName.trim();
        String current = admin.getDisplayName() == null ? "" : admin.getDisplayName().trim();
        if (!name.isEmpty() && (current.isEmpty() || current.equalsIgnoreCase("admin")) && !name.equals(current)) {
            admin.setDisplayName(name.length() > 100 ? name.substring(0, 100) : name);
            users.save(admin);
            log.info("The admin's name is now {}", admin.getDisplayName());
        }
    }

    private void resetAdmin(AppUser admin, String email, String wantedPassword) {
        if (wantedPassword.isEmpty() && email.isEmpty()) {
            log.warn("ADMIN_PASSWORD_RESET is on but neither ADMIN_PASSWORD (12+ characters) nor ADMIN_EMAIL is set: nothing was changed.");
            return;
        }
        if (!email.isEmpty() && !email.equals(admin.getEmail())) {
            if (users.existsByEmail(email)) {
                log.warn("ADMIN_EMAIL {} belongs to another account: the admin email was not changed.", email);
            } else {
                admin.setEmail(email);
                log.warn("Admin email reset to {} from ADMIN_EMAIL.", email);
            }
        }
        if (!wantedPassword.isEmpty()) {
            admin.setPasswordHash(encoder.encode(wantedPassword));
            log.warn("Admin password reset from ADMIN_PASSWORD.");
        }
        users.save(admin);
        log.warn("Set ADMIN_PASSWORD_RESET back to false, or it will reset the admin again at every start.");
    }

    private static String randomPassword() {
        byte[] b = new byte[18];
        new SecureRandom().nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
}
