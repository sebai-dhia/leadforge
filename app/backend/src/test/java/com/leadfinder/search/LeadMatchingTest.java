package com.leadfinder.search;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** The keys that decide whether two search results are the same business. */
class LeadMatchingTest {

    @Test
    void samePhoneInDifferentFormatsGivesTheSameKey() {
        String a = LeadService.phoneKey("+216 71 874 421");
        assertEquals("71874421", a);
        assertEquals(a, LeadService.phoneKey("71874421"));
        assertEquals(a, LeadService.phoneKey("00216-71-874-421"));
        assertEquals(a, LeadService.phoneKey("(+216) 71.874.421"));
    }

    @Test
    void differentPhonesGiveDifferentKeys() {
        assertNotEquals(LeadService.phoneKey("+216 71 874 421"), LeadService.phoneKey("+216 71 874 422"));
    }

    @Test
    void missingOrTooShortPhonesHaveNoKey() {
        assertNull(LeadService.phoneKey(null));
        assertNull(LeadService.phoneKey(""));
        assertNull(LeadService.phoneKey("abc"));
        assertNull(LeadService.phoneKey("123"));
    }

    @Test
    void websiteHostIgnoresSchemeWwwPathAndCase() {
        assertEquals("cabinet.tn", LeadService.websiteHost("https://www.Cabinet.tn/contact?x=1"));
        assertEquals("cabinet.tn", LeadService.websiteHost("cabinet.tn"));
        assertEquals("cabinet.tn", LeadService.websiteHost("http://cabinet.tn/"));
    }

    @Test
    void socialMediaPagesAreNeverUsedAsAKey() {
        // Two different businesses must not be merged because both have a Facebook page
        assertNull(LeadService.websiteHost("https://www.facebook.com/some.salon"));
        assertNull(LeadService.websiteHost("https://instagram.com/some.salon"));
        assertNull(LeadService.websiteHost("linktr.ee/salon"));
    }

    @Test
    void missingOrBrokenWebsitesHaveNoKey() {
        assertNull(LeadService.websiteHost(null));
        assertNull(LeadService.websiteHost("  "));
        assertNull(LeadService.websiteHost("http://exa mple.com"));
    }
}
