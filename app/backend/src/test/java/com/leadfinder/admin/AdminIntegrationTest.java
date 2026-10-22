package com.leadfinder.admin;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.GuestCleanup;
import com.leadfinder.auth.TokenService;
import com.leadfinder.search.SearchJob;
import com.leadfinder.usage.UsageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Uses real tokens, so the mapping from the token's role to the admin check is tested too. */
class AdminIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;
    @Autowired
    TokenService tokens;
    @Autowired
    UsageService usage;
    @Autowired
    GuestCleanup cleanup;

    private AppUser account(String email, String role) {
        AppUser u = newUser(email, true);
        u.setRole(role);
        return users.save(u);
    }

    private MockHttpServletRequestBuilder as(AppUser u, MockHttpServletRequestBuilder req) {
        return req.header("Authorization", "Bearer " + tokens.issue(u));
    }

    private SearchJob failedJob(AppUser u, String niche, String reason) {
        SearchJob j = newJob(u, niche);
        j.setStatus(SearchJob.Status.FAILED);
        j.setFailureReason(reason);
        return jobs.save(j);
    }

    @Test
    void onlyTheAdminCanOpenTheAdminApi() throws Exception {
        AppUser user = account("user@example.com", "USER");
        AppUser guest = account("guest@guest.leadforge.local", "GUEST");
        AppUser admin = account("boss@example.com", "ADMIN");

        mvc.perform(get("/api/admin/overview")).andExpect(status().isUnauthorized());
        mvc.perform(as(user, get("/api/admin/overview"))).andExpect(status().isForbidden());
        mvc.perform(as(guest, get("/api/admin/users"))).andExpect(status().isForbidden());
        mvc.perform(as(user, get("/api/admin/searches"))).andExpect(status().isForbidden());
        mvc.perform(as(admin, get("/api/admin/overview"))).andExpect(status().isOk());
        // the admin is still a normal user everywhere else
        mvc.perform(as(admin, get("/api/usage"))).andExpect(status().isOk());
    }

    @Test
    void overviewCountsUsersUsageRefundsAndFailedSearches() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser user = account("user@example.com", "USER");
        account("guest@guest.leadforge.local", "GUEST");

        usage.consume(user.getId(), UsageService.Kind.SEARCH);
        usage.refund(usage.consume(user.getId(), UsageService.Kind.SEARCH));
        usage.consume(user.getId(), UsageService.Kind.DRAFT);
        failedJob(user, "gyms", "No result from the search workflow within 10 minutes");
        newJob(user, "cafes"); // still pending

        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.total").value(3))
                .andExpect(jsonPath("$.users.byRole.GUEST").value(1))
                .andExpect(jsonPath("$.users.new7Days").value(3))
                .andExpect(jsonPath("$.users.seats.max").value(5))
                .andExpect(jsonPath("$.usage24h.search.used").value(1))
                .andExpect(jsonPath("$.usage24h.search.refunded").value(1))
                .andExpect(jsonPath("$.usage24h.draft.used").value(1))
                .andExpect(jsonPath("$.usage24h.enrich.used").value(0))
                .andExpect(jsonPath("$.searches.last24h").value(2))
                .andExpect(jsonPath("$.searches.failed24h").value(1))
                .andExpect(jsonPath("$.searches.pending").value(1))
                .andExpect(jsonPath("$.daily", hasSize(AdminService.DAYS)))
                .andExpect(jsonPath("$.daily[29].search").value(1))
                .andExpect(jsonPath("$.daily[29].draft").value(1))
                .andExpect(jsonPath("$.daily[0].search").value(0));
    }

    @Test
    void aRefundKeepsTheEventButGivesTheUseBack() {
        AppUser user = account("user@example.com", "USER");
        Long id = usage.consume(user.getId(), UsageService.Kind.ENRICH);
        usage.refund(id);

        assertEquals(0, usage.usage(user.getId(), UsageService.Kind.ENRICH).used());
        assertEquals(Boolean.TRUE, jdbc.queryForObject("select refunded from usage_events where id = ?", Boolean.class, id));
    }

    @Test
    void usersTableFiltersAndShowsTodaysUseAgainstTheLimits() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser user = account("sami@example.com", "USER");
        AppUser guest = account("guest-1@guest.leadforge.local", "GUEST");
        usage.consume(user.getId(), UsageService.Kind.SEARCH);
        usage.consume(guest.getId(), UsageService.Kind.DRAFT);
        newJob(user, "gyms");

        mvc.perform(as(admin, get("/api/admin/users").param("q", "SAMI")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].email").value("sami@example.com"))
                .andExpect(jsonPath("$.items[0].searches").value(1))
                .andExpect(jsonPath("$.items[0].leads").doesNotExist())
                .andExpect(jsonPath("$.items[0].usage24h.search.used").value(1))
                .andExpect(jsonPath("$.items[0].usage24h.search.limit").value(2));

        // guests have their own, smaller limits (application-test.properties)
        mvc.perform(as(admin, get("/api/admin/users").param("role", "guest")))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].usage24h.draft.used").value(1))
                .andExpect(jsonPath("$.items[0].usage24h.draft.limit").value(1));

        // a LIKE wildcard in the search box is taken literally
        mvc.perform(as(admin, get("/api/admin/users").param("q", "%")))
                .andExpect(jsonPath("$.total").value(0));

        mvc.perform(as(admin, get("/api/admin/users").param("size", "2")))
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items", hasSize(2)));
    }

    @Test
    void aRequestRecordsWhenThePersonWasLastSeen() throws Exception {
        AppUser user = account("user@example.com", "USER");
        Instant before = Instant.now().minusSeconds(1);

        mvc.perform(as(user, get("/api/usage"))).andExpect(status().isOk());

        Instant seen = users.findById(user.getId()).orElseThrow().getLastSeenAt();
        assertNotNull(seen);
        assertEquals(true, seen.isAfter(before));
    }

    @Test
    void failedSearchesOfADeletedGuestStayVisibleAndStillCountTowardTheCaps() throws Exception {
        AppUser admin = account("boss@example.com", "ADMIN");
        AppUser user = account("user@example.com", "USER");
        AppUser guest = account("guest-1@guest.leadforge.local", "GUEST");
        failedJob(user, "gyms", "Could not reach the search service: ResourceAccessException");
        failedJob(guest, "dentists", "No result from the search workflow within 10 minutes");
        SearchJob done = newJob(user, "cafes");
        done.setStatus(SearchJob.Status.DONE);
        jobs.save(done);
        usage.consume(guest.getId(), UsageService.Kind.SEARCH);

        jdbc.update("update users set created_at = now() - interval '2 hours' where id = ?", guest.getId());
        sessions.reset();
        cleanup.sweep();
        assertEquals(true, users.findById(guest.getId()).isEmpty());

        mvc.perform(as(admin, get("/api/admin/searches")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].niche").doesNotExist())
                .andExpect(jsonPath("$.items[0].city").doesNotExist())
                .andExpect(jsonPath("$.items[0].userEmail").value(nullValue()))
                .andExpect(jsonPath("$.items[0].failureReason").value("No result from the search workflow within 10 minutes"))
                .andExpect(jsonPath("$.items[1].userEmail").value("user@example.com"));

        mvc.perform(as(admin, get("/api/admin/overview")))
                .andExpect(jsonPath("$.usage24h.search.used").value(1));
    }
}
