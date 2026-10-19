package com.leadfinder.auth;

import com.leadfinder.config.AppProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ActiveSessionRegistryTest {

    private ActiveSessionRegistry registry;
    private AppProperties props;

    @BeforeEach
    void setUp() {
        AppProperties.Limits limits = new AppProperties.Limits(20, 100, 50, 5, 15, 10);
        AppProperties.N8n n8n = new AppProperties.N8n("http://n8n", "http://draft", "http://enrich", "wh-sec", "cb-sec");
        AppProperties.Demo demo = new AppProperties.Demo(true, 5, 15, false);
        props = new AppProperties("secret-must-be-at-least-32-chars-long", "http://localhost:4200", "http://localhost:8081", n8n, limits, demo, new AppProperties.Google("test-client"), new AppProperties.Guest(true, 1, 1, 1, 3),
                new AppProperties.Caps(0, 0, 0), new AppProperties.Alerts("", ""));
        registry = new ActiveSessionRegistry(props);
    }

    @Test
    void allowsVisitorsUpToMaxSessions() {
        for (int i = 0; i < 5; i++) {
            assertTrue(registry.canAcceptVisitor(), "Session " + i + " should be accepted");
            registry.registerSession("session-" + i);
        }
        assertFalse(registry.canAcceptVisitor(), "Sixth session should be rejected when cap is 5");
    }

    @Test
    void statusReflectsActiveCount() {
        registry.registerSession("s1");
        registry.registerSession("s2");

        ActiveSessionRegistry.DemoStatus status = registry.getStatus();
        assertEquals(2, status.activeSessions());
        assertEquals(5, status.maxSessions());
        assertFalse(status.demoFull());

        registry.registerSession("s3");
        registry.registerSession("s4");
        registry.registerSession("s5");

        ActiveSessionRegistry.DemoStatus fullStatus = registry.getStatus();
        assertEquals(5, fullStatus.activeSessions());
        assertTrue(fullStatus.demoFull());
    }

    @Test
    void removeSessionFreesSlot() {
        for (int i = 0; i < 5; i++) {
            registry.registerSession("sess-" + i);
        }
        assertFalse(registry.canAcceptVisitor());

        registry.removeSession("sess-2");
        assertTrue(registry.canAcceptVisitor());
    }
}
