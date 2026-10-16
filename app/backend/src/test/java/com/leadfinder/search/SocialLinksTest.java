package com.leadfinder.search;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class SocialLinksTest {

    @Test
    void keepsRealPagesAndNormalisesThem() {
        assertEquals("https://www.facebook.com/salon.nour", SocialLinks.normalizeOne("http://m.facebook.com/salon.nour/?ref=x#top"));
        assertEquals("https://www.instagram.com/salon.nour", SocialLinks.normalizeOne("https://instagram.com/salon.nour/"));
        assertEquals("https://www.facebook.com/pages/Salon/123456", SocialLinks.normalizeOne("https://www.facebook.com/pages/Salon/123456"));
    }

    @Test
    void dropsShareButtonsTrackersAndPolicyLinks() {
        assertNull(SocialLinks.normalizeOne("https://www.facebook.com/sharer/sharer.php?u=https://x.tn"));
        assertNull(SocialLinks.normalizeOne("https://www.facebook.com/plugins/like.php"));
        assertNull(SocialLinks.normalizeOne("https://www.facebook.com/tr?id=123"));
        assertNull(SocialLinks.normalizeOne("https://www.facebook.com/policies"));
        assertNull(SocialLinks.normalizeOne("https://www.instagram.com/explore/tags/hair"));
        assertNull(SocialLinks.normalizeOne("https://www.facebook.com/"));
    }

    @Test
    void profileLinksNeedAnId() {
        assertEquals("https://www.facebook.com/profile.php?id=100012345678901",
                SocialLinks.normalizeOne("https://facebook.com/profile.php?id=100012345678901&ref=bookmarks"));
        assertNull(SocialLinks.normalizeOne("https://facebook.com/profile.php"));
        assertNull(SocialLinks.normalizeOne("https://facebook.com/profile.php?id=abc"));
    }

    @Test
    void ignoresOtherSitesAndBrokenInput() {
        assertNull(SocialLinks.normalizeOne("https://twitter.com/salon"));
        assertNull(SocialLinks.normalizeOne("javascript:alert(1)"));
        assertNull(SocialLinks.normalizeOne("not a url"));
        assertNull(SocialLinks.normalizeOne(null));
        // A look-alike host must not pass
        assertNull(SocialLinks.normalizeOne("https://facebook.com.evil.example/page"));
        assertNull(SocialLinks.normalizeOne("https://evil.example/facebook.com/page"));
    }

    @Test
    void deduplicatesIgnoringCaseAndCapsTheList() {
        List<String> out = SocialLinks.normalize(List.of(
                "https://facebook.com/Salon", "https://www.facebook.com/salon/", "https://instagram.com/a",
                "https://instagram.com/b", "https://instagram.com/c"));
        assertEquals(3, out.size());
        assertEquals("https://www.facebook.com/Salon", out.get(0));
    }
}
