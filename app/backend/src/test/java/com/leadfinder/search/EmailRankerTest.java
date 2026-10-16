package com.leadfinder.search;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EmailRankerTest {

    @Test
    void aBusinessInboxBeatsAPrivacyOfficer() {
        // The real case that motivated this: a firm page listing a data-protection address first
        List<String> ranked = EmailRanker.rank(
                List.of("datenschutz@ecovis.com", "tunis@ecovis.com", "contact@ecovis.com"), "ecovis.com");
        assertEquals("contact@ecovis.com", ranked.get(0));
        assertEquals("datenschutz@ecovis.com", ranked.get(ranked.size() - 1));
    }

    @Test
    void privacyAddressesAreKeptButLast() {
        List<String> ranked = EmailRanker.rank(List.of("privacy@x.tn", "dpo@x.tn", "info@x.tn"), "x.tn");
        assertEquals("info@x.tn", ranked.get(0));
        assertEquals(3, ranked.size());
    }

    @Test
    void junkIsRemoved() {
        List<String> ranked = EmailRanker.rank(List.of(
                "noreply@shop.tn", "no-reply@shop.tn", "postmaster@shop.tn", "abc@sentry.io", "logo@2x.png",
                "user@example.com", "name@domain.com", "hello@shop.tn"), "shop.tn");
        assertEquals(List.of("hello@shop.tn"), ranked);
    }

    @Test
    void duplicatesAreRemovedIgnoringCase() {
        assertEquals(List.of("info@x.tn"), EmailRanker.rank(List.of("INFO@x.tn", "info@x.tn", " info@X.tn "), "x.tn"));
    }

    @Test
    void sameDomainAsTheWebsiteBeatsAThirdPartyAddress() {
        List<String> ranked = EmailRanker.rank(List.of("info@agency-that-built-the-site.com", "info@salon.tn"), "salon.tn");
        assertEquals("info@salon.tn", ranked.get(0));
    }

    @Test
    void aSmallBusinessOwnerOnFreeMailBeatsAnUnrelatedCompany() {
        List<String> ranked = EmailRanker.rank(List.of("info@unrelated-company.com", "owner@gmail.com"), "salon.tn");
        assertEquals("owner@gmail.com", ranked.get(0));
    }

    @Test
    void withoutAWebsiteTheBusinessInboxStillWins() {
        List<String> ranked = EmailRanker.rank(List.of("john@gmail.com", "contact@gmail.com", "support@gmail.com"), null);
        assertEquals("contact@gmail.com", ranked.get(0));
    }

    @Test
    void invalidAddressesAreRejected() {
        assertFalse(EmailRanker.isUsable("not-an-email"));
        assertFalse(EmailRanker.isUsable("a@b"));
        assertFalse(EmailRanker.isUsable("a@.tn"));
        assertFalse(EmailRanker.isUsable("a@x..tn"));
        assertTrue(EmailRanker.isUsable("a.b+c@sub.example.tn"));
    }

    @Test
    void nullsAndEmptyListsAreSafe() {
        assertTrue(EmailRanker.rank(List.of(), "x.tn").isEmpty());
        assertTrue(EmailRanker.rank(java.util.Arrays.asList((String) null, "info@x.tn"), "x.tn").contains("info@x.tn"));
    }
}
