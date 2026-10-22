package com.leadfinder.auth;

import com.leadfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminBootstrapIntegrationTest extends IntegrationTestBase {

    @Autowired
    PasswordEncoder encoder;

    private void start(String email, String password, boolean reset) {
        DemoAccountInitializer init = new DemoAccountInitializer(users, encoder);
        ReflectionTestUtils.setField(init, "adminEmail", email);
        ReflectionTestUtils.setField(init, "adminPassword", password);
        ReflectionTestUtils.setField(init, "reset", reset);
        init.run(null);
    }

    private void startNamed(String email, String name) {
        DemoAccountInitializer init = new DemoAccountInitializer(users, encoder);
        ReflectionTestUtils.setField(init, "adminEmail", email);
        ReflectionTestUtils.setField(init, "adminPassword", "first-password-123");
        ReflectionTestUtils.setField(init, "adminName", name);
        init.run(null);
    }

    private AppUser admin() {
        return users.findFirstByRoleOrderByIdAsc("ADMIN").orElseThrow();
    }

    @Test
    void theFirstStartCreatesTheAdminFromTheEnvironment() {
        start("Owner@Example.com", "first-password-123", false);
        assertEquals("owner@example.com", admin().getEmail());
        assertTrue(encoder.matches("first-password-123", admin().getPasswordHash()));
    }

    @Test
    void theAdminStartsWithAnameNotWithTheWordAdmin() {
        startNamed("owner@example.com", "Sam Owner");
        assertEquals("Sam Owner", admin().getDisplayName());
    }

    @Test
    void withoutANameTheStartOfTheEmailIsUsed() {
        startNamed("owner@example.com", "");
        assertEquals("owner", admin().getDisplayName());
    }

    @Test
    void anAdminStillCalledAdminGetsTheNameButAChosenNameIsKept() {
        startNamed("owner@example.com", "");
        AppUser a = admin();
        a.setDisplayName("Admin");
        users.save(a);

        startNamed("owner@example.com", "Sam Owner");
        assertEquals("Sam Owner", admin().getDisplayName());

        startNamed("owner@example.com", "Someone Else");
        assertEquals("Sam Owner", admin().getDisplayName(), "a name already chosen is never overwritten");
    }

    @Test
    void withoutAnEmailTheDefaultAddressIsUsed() {
        start("", "first-password-123", false);
        assertEquals("admin@leadforge.dev", admin().getEmail());
    }

    @Test
    void laterStartsDoNotTouchWhatTheAdminChangedInTheApp() {
        start("owner@example.com", "first-password-123", false);
        AppUser a = admin();
        a.setEmail("changed@example.com");
        a.setPasswordHash(encoder.encode("changed-password-123"));
        users.save(a);

        start("owner@example.com", "first-password-123", false);

        assertEquals(1, users.count());
        assertEquals("changed@example.com", admin().getEmail());
        assertTrue(encoder.matches("changed-password-123", admin().getPasswordHash()));
    }

    @Test
    void theResetFlagAppliesTheEnvironmentValuesAgain() {
        start("owner@example.com", "first-password-123", false);
        AppUser a = admin();
        a.setEmail("changed@example.com");
        a.setPasswordHash(encoder.encode("changed-password-123"));
        users.save(a);

        start("owner@example.com", "recovered-password-123", true);

        assertEquals(1, users.count());
        assertEquals("owner@example.com", admin().getEmail());
        assertTrue(encoder.matches("recovered-password-123", admin().getPasswordHash()));
    }

    @Test
    void aShortPasswordIsNeverApplied() {
        start("owner@example.com", "first-password-123", false);
        start("owner@example.com", "short", true);
        assertTrue(encoder.matches("first-password-123", admin().getPasswordHash()));
        assertFalse(encoder.matches("short", admin().getPasswordHash()));
    }
}
