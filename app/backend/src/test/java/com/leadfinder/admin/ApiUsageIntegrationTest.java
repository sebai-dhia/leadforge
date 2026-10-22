package com.leadfinder.admin;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.TokenService;
import com.leadfinder.search.LeadRepository;
import com.leadfinder.search.LeadService;
import com.leadfinder.search.N8nClient;
import com.leadfinder.search.SearchJob;
import com.leadfinder.usage.ApiMeter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** What the workflows report spending on Gemini, Serper and Geoapify, and the numbers the admin sees from it. */
class ApiUsageIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;
    @Autowired
    TokenService tokens;
    @Autowired
    LeadService leadService;
    @Autowired
    LeadRepository leads;
    @Autowired
    com.leadfinder.usage.UsageService usage;

    private AppUser account(String email, String role) {
        AppUser u = newUser(email, true);
        u.setRole(role);
        return users.save(u);
    }

    private MockHttpServletRequestBuilder as(AppUser u, MockHttpServletRequestBuilder req) {
        return req.header("Authorization", "Bearer " + tokens.issue(u)).contentType(MediaType.APPLICATION_JSON);
    }

    private void callback(SearchJob job, String meterJson) throws Exception {
        String body = "{\"jobId\":" + job.getId() + ",\"leads\":[]" + (meterJson == null ? "" : ",\"meter\":" + meterJson) + "}";
        mvc.perform(post("/api/internal/n8n/results").header("X-Callback-Secret", "test-callback-secret")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
    }

    private int rows() {
        return jdbc.queryForObject("select count(*) from api_usage", Integer.class);
    }

    @Test
    void aSearchResultKeepsWhatTheWorkflowSpent() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser user = account("user@example.com", "USER");
        SearchJob job = newJob(user, "gyms");

        callback(job, "{\"gemini\":{\"calls\":1,\"inputTokens\":1200,\"outputTokens\":300},\"serper\":{\"calls\":7},\"geoapify\":{\"calls\":2}}");

        assertEquals(3, rows());
        assertEquals(1, jdbc.queryForObject("select count(*) from api_usage where action = 'SEARCH' and provider = 'GEMINI' and input_tokens = 1200 and output_tokens = 300 and user_id = ?",
                Integer.class, user.getId()));

        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.api.tracked").value(true))
                .andExpect(jsonPath("$.api.gemini.calls24h").value(1))
                .andExpect(jsonPath("$.api.gemini.inputTokens24h").value(1200))
                .andExpect(jsonPath("$.api.gemini.outputTokens24h").value(300))
                .andExpect(jsonPath("$.api.gemini.calls30d").value(1))
                .andExpect(jsonPath("$.api.gemini.tokensPrev24h").value(0))
                .andExpect(jsonPath("$.api.serper.calls24h").value(7))
                .andExpect(jsonPath("$.api.geoapify.calls24h").value(2))
                .andExpect(jsonPath("$.api.geoapify.callsPrev24h").value(0))
                .andExpect(jsonPath("$.api.daily.length()").value(30))
                .andExpect(jsonPath("$.api.daily[29].gemini").value(1))
                .andExpect(jsonPath("$.api.daily[29].geminiTokens").value(1500))
                .andExpect(jsonPath("$.api.daily[29].serper").value(7))
                .andExpect(jsonPath("$.api.daily[0].serper").value(0));
    }

    @Test
    void nothingIsTrackedUntilAWorkflowReports() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser user = account("user@example.com", "USER");

        callback(newJob(user, "gyms"), null); // a workflow that was not deployed again sends no meter

        assertEquals(0, rows());
        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(jsonPath("$.api.tracked").value(false))
                .andExpect(jsonPath("$.api.gemini.calls24h").value(0))
                .andExpect(jsonPath("$.api.serper.calls30d").value(0))
                .andExpect(jsonPath("$.api.serper.silent").value(false))
                .andExpect(jsonPath("$.api.serper.lastAnswered").value(nullValue()));
    }

    @Test
    void absurdOrEmptyNumbersAreCutOrIgnored() throws Exception {
        AppUser user = account("user@example.com", "USER");

        callback(newJob(user, "gyms"), "{\"gemini\":{\"calls\":-5,\"inputTokens\":99999999999,\"outputTokens\":0},\"serper\":{\"calls\":999999},\"geoapify\":{\"calls\":0}}");

        assertEquals(2, rows()); // geoapify had nothing to report
        assertEquals(1000, jdbc.queryForObject("select calls from api_usage where provider = 'SERPER'", Integer.class));
        assertEquals(10_000_000L, jdbc.queryForObject("select input_tokens from api_usage where provider = 'GEMINI'", Long.class));
        assertEquals(0, jdbc.queryForObject("select calls from api_usage where provider = 'GEMINI'", Integer.class));
    }

    @Test
    void theUseOfADeletedGuestStillCountsWithoutTheAccount() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser guest = account("guest-1@guest.leadforge.local", "GUEST");
        SearchJob job = newJob(guest, "cafes");
        callback(job, "{\"serper\":{\"calls\":6}}");

        mvc.perform(as(admin, org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/admin/users/" + guest.getId())))
                .andExpect(status().isNoContent());

        assertEquals(1, jdbc.queryForObject("select count(*) from api_usage where user_id is null and provider = 'SERPER'", Integer.class));
        mvc.perform(as(admin, get("/api/admin/overview"))).andExpect(jsonPath("$.api.serper.calls24h").value(6));
    }

    @Test
    void aMessageAndAContactLookupAreRecordedToo() throws Exception {
        AppUser user = account("m1@x.tn", "USER");
        SearchJob job = newJob(user, "n");
        leadService.ingest(job, List.of(IntegrationTestBase.lead("p1", "Salon")));
        Long id = leads.findFirstByUserIdAndPlaceId(user.getId(), "p1").orElseThrow().getId();

        doReturn(new N8nClient.Draft("Sujet", "Bonjour", null, null, "draft-test0001",
                new ApiMeter(new ApiMeter.Part(2L, 3000L, 400L), null, null))).when(n8n).draft(any());
        mvc.perform(as(user, post("/api/leads/" + id + "/draft")).content("{\"language\":\"fr\",\"channel\":\"email\"}")).andExpect(status().isOk());

        doReturn(new N8nClient.Enrichment("https://salon.tn", List.of(), List.of(), List.of(), List.of(), "ok",
                new ApiMeter(null, new ApiMeter.Part(1L, null, null), null))).when(n8n).enrich(any());
        mvc.perform(as(user, post("/api/leads/" + id + "/enrich")).content("{}")).andExpect(status().isOk());

        assertEquals(1, jdbc.queryForObject("select count(*) from api_usage where action = 'DRAFT' and provider = 'GEMINI' and calls = 2 and input_tokens = 3000", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from api_usage where action = 'ENRICH' and provider = 'SERPER' and calls = 1", Integer.class));
        assertEquals(2, rows());
    }

    @Test
    void activeUsersAreCountedByWhenTheyWereLastSeen() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser recent = account("recent@example.com", "USER");
        AppUser week = account("week@example.com", "USER");
        AppUser month = account("month@example.com", "USER");
        AppUser guest = account("guest-1@guest.leadforge.local", "GUEST");
        jdbc.update("update users set last_seen_at = now() - interval '2 minutes' where id = ?", admin.getId());
        jdbc.update("update users set last_seen_at = now() - interval '3 hours' where id = ?", recent.getId());
        jdbc.update("update users set last_seen_at = now() - interval '3 days' where id = ?", week.getId());
        jdbc.update("update users set last_seen_at = now() - interval '20 days', created_at = now() - interval '40 days' where id = ?", month.getId());
        jdbc.update("update users set last_seen_at = now() where id = ?", guest.getId()); // guests never count as active users

        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active.now").value(1))
                .andExpect(jsonPath("$.active.last24h").value(2))
                .andExpect(jsonPath("$.active.last7d").value(3))
                .andExpect(jsonPath("$.active.last30d").value(4))
                .andExpect(jsonPath("$.active.registered").value(4))
                .andExpect(jsonPath("$.active.guests").value(1))
                .andExpect(jsonPath("$.active.registeredNew30d").value(3))
                .andExpect(jsonPath("$.active.registeredPrev30d").value(1));
    }

    /** The workflows started reporting three days ago (this is what makes "no answer" mean something). */
    private void trackingStartedDaysAgo(int days) {
        for (String provider : List.of("GEMINI", "SERPER", "GEOAPIFY")) {
            jdbc.update("insert into api_usage (action, provider, calls, created_at) values ('SEARCH', ?, 1, now() - make_interval(days => ?))", provider, days);
        }
    }

    private SearchJob doneSearch(AppUser user, String bbox) {
        SearchJob job = newJob(user, "gyms");
        jdbc.update("update search_jobs set status = 'DONE', bbox = ? where id = ?", bbox, job.getId());
        return job;
    }

    @Test
    void aServiceThatAnsweredNothingWhileSearchesRanIsFlaggedAndClearsWhenItAnswersAgain() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser user = account("user@example.com", "USER");
        trackingStartedDaysAgo(3);
        doneSearch(user, null);

        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(jsonPath("$.api.serper.silent").value(true))
                .andExpect(jsonPath("$.api.geoapify.silent").value(true))
                .andExpect(jsonPath("$.api.gemini.silent").value(false)) // no message was written, so it was not needed
                .andExpect(jsonPath("$.api.serper.calls24h").value(0))
                .andExpect(jsonPath("$.api.serper.lastAnswered").isNotEmpty());

        callback(newJob(user, "cafes"), "{\"serper\":{\"calls\":6},\"geoapify\":{\"calls\":1}}");

        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(jsonPath("$.api.serper.silent").value(false))
                .andExpect(jsonPath("$.api.geoapify.silent").value(false));
    }

    @Test
    void aDrawnAreaDoesNotNeedGeoapifyAndEarlierWorkIsNotCounted() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser user = account("user@example.com", "USER");
        trackingStartedDaysAgo(3);
        doneSearch(user, "10.0,36.7,10.3,36.9");

        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(jsonPath("$.api.serper.silent").value(true))
                .andExpect(jsonPath("$.api.geoapify.silent").value(false));

        // a search that finished before the workflows began reporting has no numbers to compare with
        jdbc.update("delete from api_usage");
        jdbc.update("insert into api_usage (action, provider, calls, created_at) values ('SEARCH', 'SERPER', 1, now() - interval '1 hour')");
        jdbc.update("update search_jobs set created_at = now() - interval '5 hours'");
        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(jsonPath("$.api.serper.silent").value(false));
    }

    @Test
    void geminiIsFlaggedOnlyWhenMessagesWereWrittenWithoutAnyAnswerReported() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser user = account("user@example.com", "USER");
        trackingStartedDaysAgo(3);

        usage.refund(usage.consume(user.getId(), com.leadfinder.usage.UsageService.Kind.DRAFT)); // a failed attempt was given back
        mvc.perform(as(admin, get("/api/admin/overview"))).andExpect(jsonPath("$.api.gemini.silent").value(false));

        usage.consume(user.getId(), com.leadfinder.usage.UsageService.Kind.DRAFT); // a message that was really written
        mvc.perform(as(admin, get("/api/admin/overview"))).andExpect(jsonPath("$.api.gemini.silent").value(true));

        jdbc.update("insert into api_usage (user_id, action, provider, calls, input_tokens, output_tokens) values (?, 'DRAFT', 'GEMINI', 1, 2000, 200)", user.getId());
        mvc.perform(as(admin, get("/api/admin/overview"))).andExpect(jsonPath("$.api.gemini.silent").value(false));
    }
}
