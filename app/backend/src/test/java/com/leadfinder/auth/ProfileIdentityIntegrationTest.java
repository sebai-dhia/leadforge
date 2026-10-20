package com.leadfinder.auth;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.search.NicheSuggestionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProfileIdentityIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;
    @Autowired
    NicheSuggestionService niches;

    private AppUser user() {
        AppUser u = new AppUser();
        u.setEmail("p@example.com");
        u.setPasswordHash("hash");
        return users.save(u);
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor as(AppUser u) {
        return jwt().jwt(j -> j.subject(String.valueOf(u.getId())));
    }

    private void update(AppUser u, String json, int expected) throws Exception {
        mvc.perform(put("/api/profile").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().is(expected));
    }

    @Test
    void aNewProfileIsEmptyAndNotOnboarded() throws Exception {
        AppUser u = user();
        mvc.perform(get("/api/profile").with(as(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.onboarded").value(false))
                .andExpect(jsonPath("$.services").isEmpty())
                .andExpect(jsonPath("$.links").isEmpty());
    }

    @Test
    void chosenServicesAndTheOwnSentenceBecomeTheOfferTheAiReads() throws Exception {
        AppUser u = user();
        update(u, "{\"services\":[\"Web development\",\"UI/UX design\"],\"about\":\"I build booking tools for small clinics.\"}", 200);
        mvc.perform(get("/api/profile").with(as(u)))
                .andExpect(jsonPath("$.offer").value("Web development, UI/UX design. I build booking tools for small clinics."))
                .andExpect(jsonPath("$.services[0]").value("Web development"));
    }

    @Test
    void aPartialUpdateLeavesTheRestAlone() throws Exception {
        AppUser u = user();
        update(u, "{\"displayName\":\"Sam\",\"headline\":\"Designer\",\"city\":\"Tunis\",\"language\":\"fr\"}", 200);
        update(u, "{\"onboarded\":true}", 200);
        AppUser saved = users.findById(u.getId()).orElseThrow();
        assertEquals("Sam", saved.getDisplayName());
        assertEquals("Designer", saved.getHeadline());
        assertEquals("fr", saved.getLanguage());
        assertTrue(saved.isOnboarded());
    }

    @Test
    void linksMustBePlainWebAddresses() throws Exception {
        AppUser u = user();
        update(u, "{\"links\":[{\"label\":\"Portfolio\",\"url\":\"https://sam.example/work\"}]}", 200);
        update(u, "{\"links\":[{\"label\":\"x\",\"url\":\"javascript:alert(1)\"}]}", 400);
        update(u, "{\"links\":[{\"label\":\"x\",\"url\":\"data:text/html,hi\"}]}", 400);
        update(u, "{\"links\":[{\"label\":\"\",\"url\":\"https://sam.example\"}]}", 400);
        update(u, "{\"links\":[{\"label\":\"a\",\"url\":\"https://a.example\"},{\"label\":\"b\",\"url\":\"https://b.example\"},{\"label\":\"c\",\"url\":\"https://c.example\"},{\"label\":\"d\",\"url\":\"https://d.example\"},{\"label\":\"e\",\"url\":\"https://e.example\"},{\"label\":\"f\",\"url\":\"https://f.example\"}]}", 400);
        assertEquals(1, ProfileController.ProfileDto.of(users.findById(u.getId()).orElseThrow()).links().size());
    }

    @Test
    void tooManyServicesAreRejectedAndDuplicatesCollapse() throws Exception {
        AppUser u = user();
        update(u, "{\"services\":[\"a\",\"b\",\"c\",\"d\"]}", 400);
        update(u, "{\"services\":[\"SEO\",\"SEO\"]}", 200);
        assertEquals(List.of("SEO"), ProfileController.ProfileDto.of(users.findById(u.getId()).orElseThrow()).services());
    }

    @Test
    void anEmptyNameOrOfferIsStillRejected() throws Exception {
        AppUser u = user();
        update(u, "{\"displayName\":\"  \"}", 400);
        update(u, "{\"offer\":\"\"}", 400);
    }

    @Test
    void statsCountOnlyThisUsersLeads() throws Exception {
        AppUser u = user();
        AppUser other = new AppUser();
        other.setEmail("o@example.com");
        other.setPasswordHash("hash");
        other = users.save(other);
        jdbc.update("INSERT INTO leads (user_id, name, place_id, status, email_body) VALUES (?, 'A', 'a', 'NEW', 'hello')", u.getId());
        jdbc.update("INSERT INTO leads (user_id, name, place_id, status) VALUES (?, 'B', 'b', 'CONTACTED')", u.getId());
        jdbc.update("INSERT INTO leads (user_id, name, place_id, status) VALUES (?, 'C', 'c', 'REPLIED')", u.getId());
        jdbc.update("INSERT INTO leads (user_id, name, place_id, status) VALUES (?, 'D', 'd', 'NEW')", other.getId());
        mvc.perform(get("/api/profile/stats").with(as(u)))
                .andExpect(jsonPath("$.leads").value(3))
                .andExpect(jsonPath("$.drafted").value(1))
                .andExpect(jsonPath("$.contacted").value(2))
                .andExpect(jsonPath("$.replied").value(1));
    }

    @Test
    void pickedIndustriesComeFirstInTheSuggestions() {
        List<String> out = niches.suggestFor("web design", List.of("Dentists and clinics", "Law firms"));
        assertEquals("dental clinics", out.get(0));
        assertEquals("lawyers", out.get(1));
        assertTrue(out.size() <= 8);
    }
}
