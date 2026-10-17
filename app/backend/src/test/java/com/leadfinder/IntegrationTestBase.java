package com.leadfinder;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.search.IncomingLead;
import com.leadfinder.search.N8nClient;
import com.leadfinder.search.SearchJob;
import com.leadfinder.search.SearchJobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;

/** Real Spring context and real database; only the calls to n8n are replaced. Every test starts from empty tables. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTestBase {

    static {
        TestDatabase.ensure();
    }

    @MockitoBean
    protected N8nClient n8n;

    @MockitoBean
    protected com.leadfinder.auth.GoogleTokenVerifier google;

    @Autowired
    protected com.leadfinder.auth.ActiveSessionRegistry sessions;

    @Autowired
    protected com.leadfinder.auth.AuthThrottle throttle;

    @Autowired
    protected JdbcTemplate jdbc;
    @Autowired
    protected UserRepository users;
    @Autowired
    protected SearchJobRepository jobs;

    @BeforeEach
    void cleanDatabase() {
        sessions.reset();
        throttle.reset();
        jdbc.execute("TRUNCATE usage_events, search_leads, leads, search_jobs, users RESTART IDENTITY CASCADE");
    }

    protected AppUser newUser(String email, boolean withProfile) {
        AppUser u = new AppUser();
        u.setEmail(email);
        u.setPasswordHash("not-a-real-hash");
        if (withProfile) {
            u.setOffer("Custom booking systems for small businesses");
            u.setDisplayName("Dhia");
        }
        return users.save(u);
    }

    protected SearchJob newJob(AppUser user, String niche) {
        SearchJob j = new SearchJob();
        j.setUserId(user.getId());
        j.setNiche(niche);
        j.setCity("Tunis");
        j.setService(user.getOffer().isBlank() ? "x" : user.getOffer());
        j.setSender(user.getDisplayName().isBlank() ? "x" : user.getDisplayName());
        return jobs.save(j);
    }

    /** A business as n8n would report it. */
    protected static IncomingLead lead(String placeId, String name, String address, String phone, String website,
                                       List<String> emails, List<String> social, int score) {
        return new IncomingLead(placeId, name, address, phone, null, null, website, emails, social, score, "reason");
    }

    protected static IncomingLead lead(String placeId, String name) {
        return lead(placeId, name, "Rue 1, Tunis", null, null, List.of(), List.of(), 7);
    }
}
