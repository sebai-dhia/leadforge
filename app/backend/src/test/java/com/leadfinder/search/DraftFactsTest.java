package com.leadfinder.search;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DraftFactsTest extends IntegrationTestBase {
    @Autowired
    MockMvc mvc;
    @Autowired
    LeadService leadService;
    @Autowired
    LeadRepository leads;

    private static RequestPostProcessor as(AppUser u) {
        return jwt().jwt(j -> j.subject(String.valueOf(u.getId())));
    }

    private AppUser profiled(String email) {
        AppUser u = newUser(email, true);
        u.setHeadline("Web developer for local businesses");
        u.setCity("Tunis");
        u.setAbout("I build simple websites.");
        u.setServices("[\"Web development\",\"Automation\"]");
        u.setLinks("[{\"label\":\"Portfolio\",\"url\":\"https://dhia.dev\"}]");
        return users.save(u);
    }

    private Long leadOf(AppUser u) {
        SearchJob job = newJob(u, "cafes");
        leadService.ingest(job, List.of(lead("p1", "72 Coffee", "Lac 1, Tunis", "+216 71 111 111", null, List.of(), List.of("https://www.instagram.com/72coffee"), 8)));
        Long id = leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow().getId();
        jdbc.update("update leads set rating = 4.2, reviews = 108 where id = ?", id);
        return id;
    }

    private void draft(AppUser u, Long id) throws Exception {
        mvc.perform(post("/api/leads/" + id + "/draft").with(as(u)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"language\":\"fr\",\"channel\":\"whatsapp\"}")).andExpect(status().isOk());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> lastPayload(int calls) {
        ArgumentCaptor<Map<String, Object>> c = ArgumentCaptor.forClass(Map.class);
        verify(n8n, times(calls)).draft(c.capture());
        return c.getValue();
    }

    @Test
    void theWholeProfileAndTheLeadFactsReachTheWorkflow() throws Exception {
        AppUser u = profiled("d1@x.tn");
        Long id = leadOf(u);
        doReturn(new N8nClient.Draft("S", "Bonjour", null, null)).when(n8n).draft(any());
        draft(u, id);

        Map<String, Object> p = lastPayload(1);
        assertEquals("Web developer for local businesses", p.get("headline"));
        assertEquals("Tunis", p.get("senderCity"));
        assertEquals("I build simple websites.", p.get("about"));
        assertEquals(List.of("Web development", "Automation"), p.get("services"));
        assertEquals(1, ((List<?>) p.get("links")).size());
        assertEquals(4.2, p.get("rating"));
        assertEquals(108, p.get("reviews"));
        assertEquals(List.of("https://www.instagram.com/72coffee"), p.get("social"));
        assertEquals("Dhia", p.get("senderName"));
        assertNull(p.get("linksKnowledge"), "nothing read yet");
        assertFalse(((String) p.get("linksHash")).isEmpty());
    }

    @Test
    void whatWasReadOnTheLinksIsKeptAndUsedUntilTheLinksChange() throws Exception {
        AppUser u = profiled("d2@x.tn");
        Long id = leadOf(u);
        String hash = SenderKnowledge.hashOf(users.findById(u.getId()).orElseThrow());
        doReturn(new N8nClient.Draft("S", "Bonjour", "Portfolio: websites for cafes", hash)).when(n8n).draft(any());
        draft(u, id);
        assertEquals("Portfolio: websites for cafes", users.findById(u.getId()).orElseThrow().getLinksKnowledge());

        draft(u, id);
        assertEquals("Portfolio: websites for cafes", lastPayload(2).get("linksKnowledge"), "the second message reuses it");

        // other links (a new account at the daily draft limit of the test setup): the cached text is not offered
        AppUser changed = users.findById(u.getId()).orElseThrow();
        changed.setLinks("[{\"label\":\"Portfolio\",\"url\":\"https://other.dev\"}]");
        assertNull(SenderKnowledge.fresh(changed, SenderKnowledge.hashOf(changed)), "other links: read again");
    }

    @Test
    void textReadForOldLinksIsNotStoredAfterTheLinksChanged() {
        AppUser u = profiled("d3@x.tn");
        String oldHash = SenderKnowledge.hashOf(u);
        u.setLinks("[{\"label\":\"Portfolio\",\"url\":\"https://other.dev\"}]");
        String newHash = SenderKnowledge.hashOf(u);
        assertFalse(SenderKnowledge.store(u, newHash, oldHash, "Portfolio: old"));
        assertNull(u.getLinksKnowledge());
        assertTrue(SenderKnowledge.store(u, newHash, newHash, "Portfolio: new"));
        assertNotNull(SenderKnowledge.fresh(u, newHash));
        assertEquals("", SenderKnowledge.hashOf(newUser("nolinks@x.tn", true)), "no links, no hash");
    }

    @Test
    void aGuestIsNotMadeToSignWithTheWordGuest() throws Exception {
        AppUser u = profiled("d4@x.tn");
        u.setRole("GUEST");
        u.setDisplayName("Guest");
        users.save(u);
        Long id = leadOf(u);
        doReturn(new N8nClient.Draft("S", "Bonjour", null, null)).when(n8n).draft(any());
        draft(u, id);
        assertEquals("", lastPayload(1).get("senderName"));
    }
}
