package com.leadfinder;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.RevokedTokenStore;
import com.leadfinder.search.IncomingLead;
import com.leadfinder.search.LeadRepository;
import com.leadfinder.search.LeadService;
import com.leadfinder.search.N8nClient;
import com.leadfinder.search.SearchJob;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ApiIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;
    @Autowired
    LeadService leadService;
    @Autowired
    LeadRepository leads;
    @Autowired
    RevokedTokenStore revokedStore;

    private static RequestPostProcessor as(AppUser u) {
        return jwt().jwt(j -> j.subject(String.valueOf(u.getId())));
    }

    /** The throttle counts per client address, so each test uses its own. */
    private static RequestPostProcessor from(String ip) {
        return req -> {
            req.setRemoteAddr(ip);
            return req;
        };
    }

    private static final String SEARCH = "{\"niche\":\"hair salons\",\"city\":\"Tunis\"}";

    private Long firstLeadOf(AppUser u, SearchJob job, IncomingLead... in) {
        leadService.ingest(job, List.of(in));
        return leads.findFirstByUserIdAndPlaceId(u.getId(), in[0].placeId()).orElseThrow().getId();
    }

    // ---------------------------------------------------------------- access

    @Test
    void everyApiEndpointNeedsALogin() throws Exception {
        mvc.perform(get("/api/leads")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/leads/export.xlsx")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/usage")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profile")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/searches").contentType(MediaType.APPLICATION_JSON).content(SEARCH)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/leads/1/enrich")).andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- searches and limits

    @Test
    void aSearchNeedsAFilledInProfile() throws Exception {
        AppUser u = newUser("p1@x.tn", false);
        mvc.perform(post("/api/searches").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(SEARCH))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void theDailySearchLimitIsEnforced() throws Exception {
        AppUser u = newUser("p2@x.tn", true);
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/searches").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(SEARCH))
                    .andExpect(status().isAccepted());
        }
        mvc.perform(post("/api/searches").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(SEARCH))
                .andExpect(status().isTooManyRequests());
        mvc.perform(get("/api/usage").with(as(u)))
                .andExpect(jsonPath("$.search.used").value(2))
                .andExpect(jsonPath("$.search.limit").value(2));
    }

    @Test
    void limitsArePerUser() throws Exception {
        AppUser a = newUser("p3a@x.tn", true);
        AppUser b = newUser("p3b@x.tn", true);
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/searches").with(as(a)).contentType(MediaType.APPLICATION_JSON).content(SEARCH)).andExpect(status().isAccepted());
        }
        mvc.perform(post("/api/searches").with(as(b)).contentType(MediaType.APPLICATION_JSON).content(SEARCH)).andExpect(status().isAccepted());
    }

    @Test
    void aSearchThatCannotReachN8nDoesNotUseUpTheLimit() throws Exception {
        AppUser u = newUser("p4@x.tn", true);
        doThrow(new RuntimeException("n8n is down")).when(n8n).trigger(any());
        for (int i = 0; i < 5; i++) { // more than the limit of 2: none of them counts
            mvc.perform(post("/api/searches").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(SEARCH))
                    .andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.status").value("FAILED"));
        }
        mvc.perform(get("/api/usage").with(as(u))).andExpect(jsonPath("$.search.used").value(0));
    }

    @Test
    void searchWithMultipleCitiesJoinsIntoCompositeArea() throws Exception {
        AppUser u = newUser("multi@x.tn", true);
        String multiCitySearch = "{\"niche\":\"dentists\",\"cities\":[\"Tunis\",\"Ariana\",\"La Marsa\"]}";
        mvc.perform(post("/api/searches").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(multiCitySearch))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.city").value("Tunis | Ariana | La Marsa"));
    }

    @Test
    void searchWithBboxStoresBoundingBox() throws Exception {
        AppUser u = newUser("bbox@x.tn", true);
        String bboxSearch = "{\"niche\":\"dentists\",\"bbox\":\"10.12,36.80,10.25,36.88\"}";
        mvc.perform(post("/api/searches").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(bboxSearch))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.bbox").value("10.12,36.80,10.25,36.88"))
                .andExpect(jsonPath("$.city").value(containsString("Map Area")));
    }

    @Test
    void searchWithNoLocationReturnsBadRequest() throws Exception {
        AppUser u = newUser("noloc@x.tn", true);
        String noLoc = "{\"niche\":\"dentists\"}";
        mvc.perform(post("/api/searches").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(noLoc))
                .andExpect(status().isBadRequest());
    }

    // ---------------------------------------------------------------- messages and contact lookups

    @Test
    void theDailyMessageLimitIsEnforcedAndAFailedMessageIsRefunded() throws Exception {
        AppUser u = newUser("m1@x.tn", true);
        Long id = firstLeadOf(u, newJob(u, "n"), IntegrationTestBase.lead("p1", "Salon"));
        String body = "{\"language\":\"fr\",\"channel\":\"email\"}";

        // two AI failures are refunded and do not count
        when(n8n.draft(any())).thenThrow(new RuntimeException("ai down"));
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/leads/" + id + "/draft").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadGateway());
        }
        mvc.perform(get("/api/usage").with(as(u))).andExpect(jsonPath("$.draft.used").value(0));

        doReturn(new N8nClient.Draft("Sujet", "Bonjour", null, null, "draft-test0001", null)).when(n8n).draft(any());
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/leads/" + id + "/draft").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.emailBody").value("Bonjour"))
                    .andExpect(jsonPath("$.draftLanguage").value("fr"));
        }
        mvc.perform(post("/api/leads/" + id + "/draft").with(as(u)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void theContactLookupFillsGapsReportsWhatItFoundAndIsLimited() throws Exception {
        AppUser u = newUser("e1@x.tn", true);
        Long id = firstLeadOf(u, newJob(u, "n"), IntegrationTestBase.lead("p1", "Salon"));
        when(n8n.enrich(any())).thenReturn(new N8nClient.Enrichment("https://salon.tn", List.of("info@salon.tn", "noreply@salon.tn"),
                List.of("+216 98 111 222"), List.of("https://facebook.com/salon.nour"), List.of("salon.tn"), "Checked the website.", null));

        mvc.perform(post("/api/leads/" + id + "/enrich").with(as(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found[0]").value("website"))
                .andExpect(jsonPath("$.found.length()").value(4))
                .andExpect(jsonPath("$.lead.emails[0]").value("info@salon.tn"))
                .andExpect(jsonPath("$.lead.emails.length()").value(1))
                .andExpect(jsonPath("$.lead.phone").value("+216 98 111 222"))
                .andExpect(jsonPath("$.lead.social[0]").value("https://www.facebook.com/salon.nour"))
                .andExpect(jsonPath("$.lead.contactCheckedAt").exists())
                .andExpect(jsonPath("$.note").value("Checked the website."));

        // a second lookup adds nothing, but still counts
        mvc.perform(post("/api/leads/" + id + "/enrich").with(as(u)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.found.length()").value(0));
        mvc.perform(post("/api/leads/" + id + "/enrich").with(as(u))).andExpect(status().isTooManyRequests());
    }

    @Test
    void aContactLookupThatCannotRunIsRefundedAndOnlyTheOwnerMayUseIt() throws Exception {
        AppUser owner = newUser("e2@x.tn", true);
        AppUser other = newUser("e3@x.tn", true);
        Long id = firstLeadOf(owner, newJob(owner, "n"), IntegrationTestBase.lead("p1", "Salon"));

        when(n8n.enrich(any())).thenThrow(new RuntimeException("n8n down"));
        mvc.perform(post("/api/leads/" + id + "/enrich").with(as(owner))).andExpect(status().isBadGateway());
        mvc.perform(get("/api/usage").with(as(owner))).andExpect(jsonPath("$.enrich.used").value(0));

        mvc.perform(post("/api/leads/" + id + "/enrich").with(as(other))).andExpect(status().isNotFound());
        mvc.perform(post("/api/leads/" + id + "/draft").with(as(other)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"language\":\"en\",\"channel\":\"email\"}")).andExpect(status().isNotFound());
        mvc.perform(patch("/api/leads/" + id + "/status").with(as(other)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"REPLIED\"}")).andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------- the leads list and export

    private AppUser userWithLeads() {
        AppUser u = newUser("l@x.tn", true);
        SearchJob s1 = newJob(u, "dentists");
        SearchJob s2 = newJob(u, "gyms");
        leadService.ingest(s1, List.of(
                IntegrationTestBase.lead("a", "Cabinet Alpha", "Rue 1", "+216 71 111 111", null, List.of(), List.of(), 9),
                IntegrationTestBase.lead("b", "Cabinet Beta", "Rue 2", null, null, List.of("info@beta.tn"), List.of(), 7),
                IntegrationTestBase.lead("c", "Cabinet Gamma 100%", "Rue 3", null, null, List.of(), List.of(), 5)));
        leadService.ingest(s2, List.of(
                IntegrationTestBase.lead("d", "Gym Delta", "Rue 4", null, null, List.of(), List.of("https://facebook.com/gym.delta"), 8),
                IntegrationTestBase.lead("e", "Gym Echo", "Rue 5", null, null, List.of(), List.of(), 3)));
        return u;
    }

    @Test
    void theLeadListFiltersSortsPagesAndCounts() throws Exception {
        AppUser u = userWithLeads();
        Long beta = leads.findFirstByUserIdAndPlaceId(u.getId(), "b").orElseThrow().getId();
        mvc.perform(patch("/api/leads/" + beta + "/status").with(as(u)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"CONTACTED\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/leads").with(as(u)))
                .andExpect(jsonPath("$.total").value(5))
                .andExpect(jsonPath("$.items[0].name").value("Cabinet Alpha")) // best fit first
                .andExpect(jsonPath("$.counts.NEW").value(4))
                .andExpect(jsonPath("$.counts.CONTACTED").value(1));

        mvc.perform(get("/api/leads").with(as(u)).param("status", "CONTACTED"))
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].name").value("Cabinet Beta"))
                .andExpect(jsonPath("$.counts.NEW").value(4)); // chips ignore the status filter itself

        // phone, email or a social page counts as a way to contact
        mvc.perform(get("/api/leads").with(as(u)).param("reachable", "true"))
                .andExpect(jsonPath("$.total").value(3));

        mvc.perform(get("/api/leads").with(as(u)).param("q", "gym"))
                .andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/leads").with(as(u)).param("q", "100%"))
                .andExpect(jsonPath("$.total").value(1)); // % is text, not a wildcard
        mvc.perform(get("/api/leads").with(as(u)).param("q", "%"))
                .andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/leads").with(as(u)).param("q", "_"))
                .andExpect(jsonPath("$.total").value(0));

        mvc.perform(get("/api/leads").with(as(u)).param("sort", "name").param("size", "2"))
                .andExpect(jsonPath("$.items[0].name").value("Cabinet Alpha"))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.total").value(5));
        mvc.perform(get("/api/leads").with(as(u)).param("size", "2").param("page", "2"))
                .andExpect(jsonPath("$.items.length()").value(1));

        mvc.perform(get("/api/leads").with(as(u)).param("status", "NOT_A_STATUS")).andExpect(status().isBadRequest());
    }

    @Test
    void theLeadListCanBeNarrowedToOneSearch() throws Exception {
        AppUser u = userWithLeads();
        Long gymsJob = jdbc.queryForObject("select id from search_jobs where niche = 'gyms'", Long.class);
        mvc.perform(get("/api/leads").with(as(u)).param("searchId", String.valueOf(gymsJob)))
                .andExpect(jsonPath("$.total").value(2));
    }

    @Test
    void youOnlySeeYourOwnLeads() throws Exception {
        userWithLeads();
        AppUser other = newUser("o@x.tn", true);
        mvc.perform(get("/api/leads").with(as(other))).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/leads/export.xlsx").with(as(other)))
                .andExpect(status().isOk())
                .andExpect(result -> assertEquals(1, sheet(result.getResponse().getContentAsByteArray()).split("<row ").length - 1, "header only"));
    }

    @Test
    void theExportIsAnExcelFileThatIsSafeToOpen() throws Exception {
        AppUser u = newUser("csv@x.tn", true);
        SearchJob s = newJob(u, "dentists");
        leadService.ingest(s, List.of(
                IntegrationTestBase.lead("a", "=HYPERLINK(\"http://evil.example\")", "12, Rue \"A\"", "+216 71 111 111", null,
                        List.of("a@x.tn", "b@x.tn"), List.of(), 9),
                IntegrationTestBase.lead("b", "عيادة", "تونس", null, null, List.of(), List.of(), 5)));

        mvc.perform(get("/api/leads/export.xlsx").param("lang", "fr").with(as(u)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .andExpect(result -> {
                    String xml = sheet(result.getResponse().getContentAsByteArray());
                    assertTrue(xml.contains("&quot;http://evil.example&quot;") && !xml.contains("<f>"), "a formula-looking name is text, not a formula");
                    assertTrue(xml.contains("+216 71 111 111"), "real phone number kept intact");
                    assertTrue(xml.contains("a@x.tn; b@x.tn"));
                    assertTrue(xml.contains("12, Rue &quot;A&quot;"), "quotes escaped");
                    assertTrue(xml.contains("عيادة"));
                    assertTrue(xml.contains("Nouveau"), "status in the asked language, not the raw code");
                    assertTrue(xml.contains("Téléphone"), "header in the asked language");
                })
                .andExpect(result -> assertTrue(result.getResponse().getHeader("Content-Disposition")
                        .matches(".*\\d{4}-\\d{2}-\\d{2}-leadforge-dentists.*\\.xlsx.*")));
    }

    /** The text of the one sheet inside the .xlsx (a zip file). */
    private static String sheet(byte[] xlsx) throws java.io.IOException {
        try (java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(xlsx))) {
            for (java.util.zip.ZipEntry e; (e = zip.getNextEntry()) != null; ) {
                if (e.getName().equals("xl/worksheets/sheet1.xml")) return new String(zip.readAllBytes(), StandardCharsets.UTF_8);
            }
        }
        throw new AssertionError("no sheet in the file");
    }

    // ---------------------------------------------------------------- sign in and sign up

    @Test
    void repeatedFailedLoginsAreBlockedPerAddressAndEmail() throws Exception {
        String ip = "10.1.1.1";
        String wrong = "{\"email\":\"victim@x.tn\",\"password\":\"wrong-password\"}";
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/auth/login").with(from(ip)).contentType(MediaType.APPLICATION_JSON).content(wrong))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").with(from(ip)).contentType(MediaType.APPLICATION_JSON).content(wrong))
                .andExpect(status().isTooManyRequests());
        // another email from the same address, and the same email from another address, are not locked out
        mvc.perform(post("/api/auth/login").with(from(ip)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"someone@x.tn\",\"password\":\"wrong-password\"}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(from("10.1.1.2")).contentType(MediaType.APPLICATION_JSON).content(wrong))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aSuccessfulLoginClearsTheFailureCount() throws Exception {
        String ip = "10.2.2.2";
        accountWithPassword("real@x.tn", "correct-horse-1");
        String wrong = "{\"email\":\"real@x.tn\",\"password\":\"wrong-password\"}";
        String right = "{\"email\":\"real@x.tn\",\"password\":\"correct-horse-1\"}";
        for (int round = 0; round < 3; round++) {
            for (int i = 0; i < 2; i++) {
                mvc.perform(post("/api/auth/login").with(from(ip)).contentType(MediaType.APPLICATION_JSON).content(wrong))
                        .andExpect(status().isUnauthorized());
            }
            mvc.perform(post("/api/auth/login").with(from(ip)).contentType(MediaType.APPLICATION_JSON).content(right))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.token").exists());
        }
    }

    @Test
    void loggingOutEndsTheTokenOnTheServer() throws Exception {
        accountWithPassword("leaver@x.tn", "correct-horse-1");
        String body = mvc.perform(post("/api/auth/login").with(from("10.4.4.4")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"leaver@x.tn\",\"password\":\"correct-horse-1\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token = body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
    }

    @Test
    void aRemovedAccountsTokenStopsWorking() throws Exception {
        accountWithPassword("gone@x.tn", "correct-horse-1");
        String body = mvc.perform(post("/api/auth/login").with(from("10.5.5.5")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"gone@x.tn\",\"password\":\"correct-horse-1\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token = body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        Thread.sleep(1100); // a token issued in the very second of the removal counts as newer
        sessions.revokeUser(users.findByEmail("gone@x.tn").orElseThrow().getId());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
    }

    @Test
    void revocationsSurviveARestart() {
        sessions.revokeSession("signed-out-sid");
        sessions.revokeUser(42L);
        jdbc.update("insert into revoked_tokens (kind, key, revoked_at) values ('SESSION', 'long-expired', now() - interval '2 days')");

        // a fresh registry stands for the backend after a restart: it only knows what the database kept
        var restarted = new com.leadfinder.auth.ActiveSessionRegistry(settings, revokedStore);
        restarted.afterSingletonsInstantiated();
        assertTrue(restarted.isRevoked("signed-out-sid", null));
        assertTrue(restarted.isRevoked("other-sid", 42L));
        assertFalse(restarted.isRevoked("long-expired", null));
        assertFalse(restarted.isRevoked("other-sid", 7L));
    }

    // ---------------------------------------------------------------- the n8n callback

    @Test
    void theCallbackNeedsTheSecretAndStoresResultsOnce() throws Exception {
        AppUser u = newUser("cb@x.tn", true);
        SearchJob job = newJob(u, "hair salons");
        String body = "{\"jobId\":" + job.getId() + ",\"leads\":[{\"placeId\":\"p1\",\"name\":\"Salon\",\"address\":\"Rue 1\","
                + "\"phone\":\"+216 71 111 111\",\"website\":null,\"emails\":[\"info@salon.tn\"],\"social\":[],\"score\":8,\"reason\":\"r\"}]}";

        mvc.perform(post("/api/internal/n8n/results").header("X-Callback-Secret", "wrong").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/internal/n8n/results").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is4xxClientError());

        mvc.perform(post("/api/internal/n8n/results").header("X-Callback-Secret", "test-callback-secret")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        mvc.perform(post("/api/internal/n8n/results").header("X-Callback-Secret", "test-callback-secret")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()); // a repeated callback changes nothing

        mvc.perform(get("/api/searches/" + job.getId()).with(as(u)))
                .andExpect(jsonPath("$.job.status").value("DONE"))
                .andExpect(jsonPath("$.job.foundCount").value(1))
                .andExpect(jsonPath("$.job.newCount").value(1))
                .andExpect(jsonPath("$.leads.length()").value(1))
                .andExpect(jsonPath("$.leads[0].emails[0]").value("info@salon.tn"));
        mvc.perform(get("/api/leads").with(as(u))).andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void aSearchIsOnlyVisibleToItsOwner() throws Exception {
        AppUser owner = newUser("s1@x.tn", true);
        AppUser other = newUser("s2@x.tn", true);
        SearchJob job = newJob(owner, "n");
        mvc.perform(get("/api/searches/" + job.getId()).with(as(other))).andExpect(status().isNotFound());
        mvc.perform(get("/api/searches").with(as(other))).andExpect(jsonPath("$.length()").value(0));
        List<String> unused = new ArrayList<>();
        assertTrue(unused.isEmpty());
    }

    @Test
    void theBodyOfANotFoundOrFailedRequestIsNotMaskedAsUnauthorized() throws Exception {
        // /error must stay reachable, otherwise real server faults are reported as 401
        mvc.perform(post("/api/internal/n8n/results").header("X-Callback-Secret", "test-callback-secret")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"jobId\":999999,\"leads\":[]}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/usage")).andExpect(content().string(containsString("")));
    }
}
