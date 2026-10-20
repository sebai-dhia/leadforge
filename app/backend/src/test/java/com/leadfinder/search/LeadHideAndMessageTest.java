package com.leadfinder.search;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LeadHideAndMessageTest extends IntegrationTestBase {
    @Autowired
    MockMvc mvc;
    @Autowired
    LeadService leadService;
    @Autowired
    LeadRepository leads;

    private static RequestPostProcessor as(AppUser u) {
        return jwt().jwt(j -> j.subject(String.valueOf(u.getId())));
    }

    private Long ingest(AppUser u, String placeId, String name) {
        SearchJob job = newJob(u, "cafes");
        leadService.ingest(job, List.of(lead(placeId, name, "Rue " + placeId + ", Tunis", "+216 71 " + String.format("%06d", Math.abs(placeId.hashCode()) % 1000000), null, List.of(), List.of(), 7)));
        return leads.findFirstByUserIdAndPlaceId(u.getId(), placeId).orElseThrow().getId();
    }

    @Test
    void aHiddenLeadLeavesTheListsAndComesBack() throws Exception {
        AppUser u = newUser("h1@x.tn", true);
        Long id = ingest(u, "p1", "Cafe Nour");
        ingest(u, "p2", "Cafe Lac");

        mvc.perform(patch("/api/leads/" + id + "/hidden").with(as(u)).contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hidden").value(true));

        mvc.perform(get("/api/leads").with(as(u)))
                .andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].name").value("Cafe Lac"))
                .andExpect(jsonPath("$.counts.NEW").value(1)).andExpect(jsonPath("$.hiddenCount").value(1));
        mvc.perform(get("/api/leads").param("hidden", "true").with(as(u)))
                .andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].name").value("Cafe Nour"));

        mvc.perform(patch("/api/leads/" + id + "/hidden").with(as(u)).contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":false}"))
                .andExpect(jsonPath("$.hidden").value(false));
        mvc.perform(get("/api/leads").with(as(u))).andExpect(jsonPath("$.items", hasSize(2))).andExpect(jsonPath("$.hiddenCount").value(0));
    }

    @Test
    void aHiddenBusinessFoundAgainIsNotNewAndStaysHidden() throws Exception {
        AppUser u = newUser("h2@x.tn", true);
        Long id = ingest(u, "p1", "Cafe Nour");
        mvc.perform(patch("/api/leads/" + id + "/hidden").with(as(u)).contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":true}"));

        SearchJob again = newJob(u, "coffee shops");
        LeadService.IngestResult r = leadService.ingest(again, List.of(lead("p1", "Cafe Nour", "Rue p1, Tunis", "+216 71 " + String.format("%06d", Math.abs("p1".hashCode()) % 1000000), null, List.of(), List.of(), 9)));
        assertEquals(0, r.created());
        mvc.perform(get("/api/leads").with(as(u))).andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(get("/api/searches/" + again.getId()).with(as(u))).andExpect(jsonPath("$.leads[0].hidden").value(true));
    }

    @Test
    void editsToTheMessageAreSavedAndTheMessageCanBeCleared() throws Exception {
        AppUser u = newUser("h3@x.tn", true);
        Long id = ingest(u, "p1", "Cafe Nour");

        mvc.perform(patch("/api/leads/" + id + "/message").with(as(u)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Hello\",\"body\":\"My own words\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.emailBody").value("My own words")).andExpect(jsonPath("$.subject").value("Hello"));
        assertEquals("My own words", leads.findById(id).orElseThrow().getEmailBody());

        mvc.perform(patch("/api/leads/" + id + "/message").with(as(u)).contentType(MediaType.APPLICATION_JSON).content("{\"subject\":\"x\",\"body\":\"  \"}"))
                .andExpect(status().isBadRequest());

        jdbc.update("update leads set draft_prompt_version = 'draft-test0001' where id = ?", id);
        mvc.perform(delete("/api/leads/" + id + "/message").with(as(u))).andExpect(status().isOk());
        Lead after = leads.findById(id).orElseThrow();
        assertNull(after.getDraftPromptVersion(), "clearing the message clears its prompt version too");
        assertNull(after.getEmailBody());
        assertNull(after.getDraftChannel());
    }

    @Test
    void otherPeopleCannotHideOrEditMyLead() throws Exception {
        AppUser a = newUser("h4a@x.tn", true);
        AppUser b = newUser("h4b@x.tn", true);
        Long id = ingest(a, "p1", "Cafe Nour");
        mvc.perform(patch("/api/leads/" + id + "/hidden").with(as(b)).contentType(MediaType.APPLICATION_JSON).content("{\"hidden\":true}"))
                .andExpect(status().isNotFound());
        mvc.perform(patch("/api/leads/" + id + "/message").with(as(b)).contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"x\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/leads/" + id + "/message").with(as(b))).andExpect(status().isNotFound());
    }
}
