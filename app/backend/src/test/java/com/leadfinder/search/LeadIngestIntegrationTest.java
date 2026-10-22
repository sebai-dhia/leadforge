package com.leadfinder.search;

import com.leadfinder.IntegrationTestBase;
import com.leadfinder.auth.AppUser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LeadIngestIntegrationTest extends IntegrationTestBase {

    @Autowired
    LeadService service;
    @Autowired
    LeadRepository leads;
    @Autowired
    SearchLeadRepository links;

    private long leadCount(AppUser u) {
        return jdbc.queryForObject("select count(*) from leads where user_id = ?", Long.class, u.getId());
    }

    @Test
    void theSameBusinessFoundTwiceIsOneLeadAndKeepsItsStatusAndMessage() {
        AppUser u = newUser("a@x.tn", true);
        SearchJob first = newJob(u, "hair salons");
        SearchJob second = newJob(u, "beauty salons");

        LeadService.IngestResult r1 = service.ingest(first, List.of(lead("p1", "Salon Nour", "Rue 1", "+216 71 111 111", null, List.of(), List.of(), 7)));
        assertEquals(1, r1.created());

        Lead stored = leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow();
        stored.setStatus("CONTACTED");
        stored.setSubject("Hello");
        stored.setEmailBody("My message");
        leads.save(stored);

        LeadService.IngestResult r2 = service.ingest(second, List.of(lead("p1", "Salon Nour", "Rue 1", "+216 71 111 111", null, List.of(), List.of(), 9)));
        assertEquals(1, r2.found());
        assertEquals(0, r2.created(), "already known, so not new");

        assertEquals(1, leadCount(u));
        Lead after = leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow();
        assertEquals("CONTACTED", after.getStatus());
        assertEquals("My message", after.getEmailBody());
        assertEquals(9, after.getScore(), "the score is refreshed");
        assertEquals("beauty salons", after.getNiche(), "the latest search is remembered");
        assertTrue(links.existsById(new SearchLead.Key(first.getId(), after.getId())));
        assertTrue(links.existsById(new SearchLead.Key(second.getId(), after.getId())));
    }

    @Test
    void aBusinessIsRecognisedByPhoneWebsiteOrNameAndAddressWhenThePlaceIdIsMissing() {
        AppUser u = newUser("b@x.tn", true);
        service.ingest(newJob(u, "n"), List.of(
                lead(null, "Phone Shop", "Rue 1", "+216 71 874 421", null, List.of(), List.of(), 7),
                lead(null, "Web Shop", "Rue 2", null, "https://www.webshop.tn/home", List.of(), List.of(), 7),
                lead(null, "Plain Shop", "Rue 3, Tunis", null, null, List.of(), List.of(), 7)));
        assertEquals(3, leadCount(u));

        LeadService.IngestResult again = service.ingest(newJob(u, "n"), List.of(
                lead(null, "Phone Shop (renamed)", "Elsewhere", "71 874 421", null, List.of(), List.of(), 7),
                lead(null, "Web Shop", "Other address", null, "http://webshop.tn/", List.of(), List.of(), 7),
                lead(null, "PLAIN SHOP", "rue 3, tunis", null, null, List.of(), List.of(), 7)));
        assertEquals(3, again.found());
        assertEquals(0, again.created());
        assertEquals(3, leadCount(u));
    }

    @Test
    void differentBusinessesAreNotMerged() {
        AppUser u = newUser("c@x.tn", true);
        service.ingest(newJob(u, "n"), List.of(
                lead("p1", "Salon A", "Rue 1", "+216 71 111 111", "https://a.tn", List.of(), List.of(), 7)));
        LeadService.IngestResult r = service.ingest(newJob(u, "n"), List.of(
                lead("p2", "Salon B", "Rue 9", "+216 71 222 222", "https://b.tn", List.of(), List.of(), 7)));
        assertEquals(1, r.created());
        assertEquals(2, leadCount(u));
    }

    @Test
    void twoBusinessesWithOnlyAFacebookPageAreNotMergedBecauseTheyShareFacebook() {
        AppUser u = newUser("d@x.tn", true);
        LeadService.IngestResult r = service.ingest(newJob(u, "n"), List.of(
                lead("p1", "Salon A", "Rue 1", null, "https://www.facebook.com/salon.a", List.of(), List.of(), 7),
                lead("p2", "Salon B", "Rue 2", null, "https://www.facebook.com/salon.b", List.of(), List.of(), 7)));
        assertEquals(2, r.created());
        assertNull(leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow().getWebsiteHost());
    }

    @Test
    void theSameBusinessForTwoUsersIsTwoSeparateLeads() {
        AppUser a = newUser("e1@x.tn", true);
        AppUser b = newUser("e2@x.tn", true);
        service.ingest(newJob(a, "n"), List.of(lead("p1", "Shared", "Rue 1", "+216 71 111 111", null, List.of(), List.of(), 7)));
        LeadService.IngestResult r = service.ingest(newJob(b, "n"), List.of(lead("p1", "Shared", "Rue 1", "+216 71 111 111", null, List.of(), List.of(), 7)));
        assertEquals(1, r.created(), "new to the second user");
        assertEquals(1, leadCount(a));
        assertEquals(1, leadCount(b));
    }

    @Test
    void aMissingValueNeverErasesAKnownOne() {
        AppUser u = newUser("f@x.tn", true);
        service.ingest(newJob(u, "n"), List.of(
                lead("p1", "Salon", "Rue 1", "+216 71 111 111", "https://salon.tn", List.of("contact@salon.tn"), List.of("https://facebook.com/salon"), 7)));
        service.ingest(newJob(u, "n"), List.of(lead("p1", "Salon", null, null, null, List.of(), List.of(), 7)));

        Lead l = leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow();
        assertEquals("+216 71 111 111", l.getPhone());
        assertEquals("https://salon.tn", l.getWebsite());
        assertEquals("contact@salon.tn", l.getEmails());
        assertEquals("https://www.facebook.com/salon", l.getSocial());
        assertEquals("Rue 1", l.getAddress());
    }

    @Test
    void emailsAreRankedAndJunkIsDroppedWhenStored() {
        AppUser u = newUser("g@x.tn", true);
        service.ingest(newJob(u, "n"), List.of(lead("p1", "Firm", "Rue 1", null, "https://ecovis.com",
                List.of("datenschutz@ecovis.com", "noreply@ecovis.com", "logo@2x.png", "tunis@ecovis.com", "contact@ecovis.com"),
                List.of(), 7)));
        assertEquals("contact@ecovis.com,tunis@ecovis.com,datenschutz@ecovis.com",
                leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow().getEmails());
    }

    @Test
    void socialLinksAreCleanedWhenStored() {
        AppUser u = newUser("h@x.tn", true);
        service.ingest(newJob(u, "n"), List.of(lead("p1", "Salon", "Rue 1", null, null, List.of(),
                List.of("https://www.facebook.com/sharer/sharer.php?u=x", "https://m.facebook.com/salon.nour/?ref=x",
                        "https://evil.example/facebook.com/salon", "javascript:alert(1)"), 7)));
        assertEquals("https://www.facebook.com/salon.nour",
                leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow().getSocial());
    }

    @Test
    void aBlankNameIsSkipped() {
        AppUser u = newUser("i@x.tn", true);
        LeadService.IngestResult r = service.ingest(newJob(u, "n"), List.of(lead("p1", "  "), lead("p2", "Real")));
        assertEquals(1, r.found());
        assertEquals(1, leadCount(u));
    }

    @Test
    void twoSearchesFinishingAtTheSameMomentCreateEachBusinessOnce() throws Exception {
        AppUser u = newUser("j@x.tn", true);
        List<IncomingLead> batch = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            batch.add(lead("place-" + i, "Business " + i, "Street " + i, null, null, List.of(), List.of(), 7));
        }
        SearchJob jobA = newJob(u, "hair salons");
        SearchJob jobB = newJob(u, "beauty salons");

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<LeadService.IngestResult>> futures = new ArrayList<>();
        for (SearchJob job : List.of(jobA, jobB)) {
            futures.add(pool.submit(() -> {
                go.await();
                return service.ingest(job, batch);
            }));
        }
        go.countDown();
        int created = 0;
        for (Future<LeadService.IngestResult> f : futures) {
            LeadService.IngestResult r = f.get(60, TimeUnit.SECONDS); // would throw on a unique-key clash
            assertEquals(40, r.found());
            created += r.created();
        }
        pool.shutdown();

        assertEquals(40, created, "every business is new exactly once, in whichever search got there first");
        assertEquals(40, leadCount(u));
    }

    @Test
    void aContactLookupOnlyFillsGaps() {
        AppUser u = newUser("k@x.tn", true);
        service.ingest(newJob(u, "n"), List.of(lead("p1", "Salon", "Rue 1", "+216 71 111 111", "https://salon.tn",
                List.of("info@salon.tn"), List.of(), 7)));
        Lead l = leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow();

        LeadService.EnrichOutcome out = service.applyEnrichment(l, new N8nClient.Enrichment(
                "https://other-site.tn", List.of("owner@gmail.com", "info@salon.tn", "noreply@salon.tn"),
                List.of("+216 99 999 999"), List.of("https://facebook.com/salon.nour"), List.of(), "ok", null));

        assertEquals("https://salon.tn", l.getWebsite(), "an existing website is never replaced");
        assertEquals("+216 71 111 111", l.getPhone(), "an existing phone is never replaced");
        assertEquals("info@salon.tn,owner@gmail.com", l.getEmails(), "new emails are added, junk and repeats are not");
        assertEquals("https://www.facebook.com/salon.nour", l.getSocial());
        assertEquals(List.of("1 email", "social page"), out.found());
        assertTrue(l.getContactCheckedAt() != null);
    }

    @Test
    void aContactLookupFillsAMissingWebsiteAndPhone() {
        AppUser u = newUser("l@x.tn", true);
        service.ingest(newJob(u, "n"), List.of(lead("p1", "Salon", "Rue 1", null, null, List.of(), List.of(), 7)));
        Lead l = leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow();

        LeadService.EnrichOutcome out = service.applyEnrichment(l, new N8nClient.Enrichment(
                "https://salon.tn", List.of(), List.of("+216 98 111 222"), List.of(), List.of(), "ok", null));

        assertEquals("https://salon.tn", l.getWebsite());
        assertEquals("salon.tn", l.getWebsiteHost());
        assertEquals("+216 98 111 222", l.getPhone());
        assertEquals("98111222", l.getPhoneKey());
        assertEquals(List.of("website", "phone number"), out.found());
    }

    @Test
    void aContactLookupRefusesANonWebAddress() {
        AppUser u = newUser("m@x.tn", true);
        service.ingest(newJob(u, "n"), List.of(lead("p1", "Salon", "Rue 1", null, null, List.of(), List.of(), 7)));
        Lead l = leads.findFirstByUserIdAndPlaceId(u.getId(), "p1").orElseThrow();
        service.applyEnrichment(l, new N8nClient.Enrichment("javascript:alert(1)", List.of(), List.of(), List.of(), List.of(), "x", null));
        assertNull(l.getWebsite());
    }
}
