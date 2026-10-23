package com.leadfinder.auth;

import com.leadfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Accounts are created through Google only, with a password chosen right after; a forgotten password goes the same way. */
class GoogleSignInIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;

    private static final String BODY = "{\"credential\":\"fake-id-token\"}";
    private static final String GOOD = "orange-tiger-bicycle-42";

    private void googleSays(String sub, String email, boolean verified) {
        when(google.verify(anyString())).thenReturn(new GoogleTokenVerifier.GoogleIdentity(sub, email, verified, "Sam Example"));
    }

    private String google(String path) throws Exception {
        String body = mvc.perform(post("/api/auth/google" + path).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return body.replaceAll(".*\"passwordTicket\":\"([^\"]+)\".*", "$1");
    }

    private org.springframework.test.web.servlet.ResultActions choose(String ticket, String password) throws Exception {
        return mvc.perform(post("/api/auth/google/password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"password\":\"" + password + "\"}"));
    }

    private static String tokenOf(String body) {
        return body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    private org.springframework.test.web.servlet.ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"));
    }

    @Test
    void firstGoogleSignInAsksForAPasswordBeforeCreatingTheAccount() throws Exception {
        googleSays("sub-1", "Sam@Example.com", true);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("sam@example.com"))
                .andExpect(jsonPath("$.passwordTicket").isNotEmpty())
                .andExpect(jsonPath("$.token").doesNotExist());
        assertEquals(0, users.count());
    }

    @Test
    void choosingThePasswordCreatesTheAccountAndBothWaysSignIn() throws Exception {
        googleSays("sub-2", "sam@example.com", true);
        choose(google(""), GOOD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.role").value("USER"));
        AppUser u = users.findByEmail("sam@example.com").orElseThrow();
        assertEquals("sub-2", u.getGoogleSub());
        assertNotNull(u.getPasswordHash());
        assertEquals("Sam Example", u.getDisplayName());

        sessions.reset();
        login("sam@example.com", GOOD).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.passwordTicket").doesNotExist());
        assertEquals(1, users.count());
    }

    @Test
    void aTicketWorksOnceAndIsNotASession() throws Exception {
        googleSays("sub-3", "once@example.com", true);
        String ticket = google("");
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + ticket)).andExpect(status().isUnauthorized());
        choose(ticket, GOOD).andExpect(status().isOk());
        choose(ticket, GOOD).andExpect(status().isGone());
        choose("made-up-ticket", GOOD).andExpect(status().isGone());
    }

    @Test
    void weakOrLeakedPasswordsAreRefusedAndTheTicketCanBeUsedAgain() throws Exception {
        googleSays("sub-4", "careful@example.com", true);
        String ticket = google("");
        choose(ticket, "short-1").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.problem").value("TOO_SHORT"));
        choose(ticket, "careful-and-long-2").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.problem").value("SAME_AS_EMAIL"));
        choose(ticket, "x".repeat(73)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.problem").value("TOO_LONG"));
        when(pwned.isPwned("password123456")).thenReturn(true);
        choose(ticket, "password123456").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.problem").value("LEAKED"));
        assertEquals(0, users.count());
        choose(ticket, GOOD).andExpect(status().isOk());
    }

    @Test
    void invalidTokenIsRejected() throws Exception {
        when(google.verify(anyString())).thenThrow(new IllegalArgumentException("bad"));
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
        assertEquals(0, users.count());
    }

    @Test
    void unverifiedGoogleEmailIsRejected() throws Exception {
        googleSays("sub-5", "nope@example.com", false);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
        assertEquals(0, users.count());
    }

    @Test
    void anExistingPasswordAccountIsNeverTakenOverByGoogleSignIn() throws Exception {
        accountWithPassword("taken@example.com", "first-owner-pass-1");
        googleSays("sub-6", "taken@example.com", true);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict());
        assertEquals(null, users.findByEmail("taken@example.com").orElseThrow().getGoogleSub());
    }

    @Test
    void anOlderGoogleAccountWithoutPasswordIsAskedForOne() throws Exception {
        AppUser old = new AppUser();
        old.setEmail("old@example.com");
        old.setGoogleSub("sub-7");
        users.save(old);
        googleSays("sub-7", "old@example.com", true);
        choose(google(""), GOOD).andExpect(status().isOk());
        assertEquals(1, users.count());
        sessions.reset();
        login("old@example.com", GOOD).andExpect(status().isOk());
    }

    @Test
    void aForgottenPasswordIsReplacedThroughGoogleAndOtherSessionsEnd() throws Exception {
        googleSays("sub-8", "forgot@example.com", true);
        String old = tokenOf(choose(google(""), GOOD).andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + old)).andExpect(status().isOk());
        Thread.sleep(1100); // a token's issue time has whole seconds

        String fresh = tokenOf(choose(google("/reset"), "brand-new-pass-77").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + old)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + fresh)).andExpect(status().isOk());
        sessions.reset();
        login("forgot@example.com", GOOD).andExpect(status().isUnauthorized());
        login("forgot@example.com", "brand-new-pass-77").andExpect(status().isOk());
    }

    @Test
    void aPasswordAccountCanBeRecoveredWithGoogleAndGetsConnectedToIt() throws Exception {
        accountWithPassword("legacy@example.com", "lost-password-123");
        googleSays("sub-9", "legacy@example.com", true);
        choose(google("/reset"), "found-again-pass-9").andExpect(status().isOk());
        assertEquals("sub-9", users.findByEmail("legacy@example.com").orElseThrow().getGoogleSub());
    }

    @Test
    void resetNeedsAnAccountAndTheRightGoogleAccount() throws Exception {
        googleSays("sub-10", "nobody@example.com", true);
        mvc.perform(post("/api/auth/google/reset").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound());

        AppUser linked = accountWithPassword("linked@example.com", "linked-pass-1234");
        linked.setGoogleSub("sub-owner");
        users.save(linked);
        // another Google account with the same address does not find it: the account is tied to its own Google account
        googleSays("sub-intruder", "linked@example.com", true);
        mvc.perform(post("/api/auth/google/reset").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound());
    }

    @Test
    void signedInPeopleChangeTheirPasswordWithTheCurrentOne() throws Exception {
        accountWithPassword("change@example.com", "current-pass-123");
        String body = login("change@example.com", "current-pass-123").andReturn().getResponse().getContentAsString();
        String token = tokenOf(body);
        Thread.sleep(1100);

        mvc.perform(put("/api/auth/password").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"not-the-one-1\",\"newPassword\":\"next-pass-456789\"}"))
                .andExpect(status().isUnauthorized());
        String fresh = tokenOf(mvc.perform(put("/api/auth/password").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"current-pass-123\",\"newPassword\":\"next-pass-456789\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + fresh)).andExpect(status().isOk());
    }

    @Test
    void theCurrentPasswordIsCheckedBeforeTheNewOneIsAsked() throws Exception {
        accountWithPassword("verify@example.com", "current-pass-123");
        String token = tokenOf(login("verify@example.com", "current-pass-123").andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/auth/password/verify").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":\"not-the-one-1\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/password/verify").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":\"current-pass-123\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/auth/password/verify").contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"current-pass-123\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());
    }

    @Test
    void theProfileSaysWhetherTheAccountHasAPassword() throws Exception {
        AppUser googleOnly = new AppUser();
        googleOnly.setEmail("only-google@example.com");
        googleOnly.setGoogleSub("sub-g");
        users.save(googleOnly);
        mvc.perform(get("/api/profile").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                        .jwt().jwt(j -> j.subject(String.valueOf(googleOnly.getId())))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasPassword").value(false));
        AppUser withPassword = accountWithPassword("has-pass@example.com", "some-password-123");
        mvc.perform(get("/api/profile").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                        .jwt().jwt(j -> j.subject(String.valueOf(withPassword.getId())))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasPassword").value(true));
    }

    @Test
    void thereIsNoSignUpWithoutGoogle() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"new@example.com\",\"password\":\"orange-tiger-bicycle-42\"}"))
                .andExpect(r -> assertTrue(r.getResponse().getStatus() >= 400));
        assertEquals(0, users.count());
    }

    @Test
    void whenAllGuestSeatsAreTakenPeopleWithAnAccountAreNeverTurnedAway() throws Exception {
        for (int i = 0; i < 5; i++) sessions.registerSession("busy-" + i);
        mvc.perform(post("/api/auth/guest")).andExpect(status().isTooManyRequests());

        // a new account through Google, an email sign-in and a returning Google sign-in all still work
        googleSays("sub-11", "late@example.com", true);
        choose(google(""), GOOD).andExpect(status().isOk());
        accountWithPassword("regular@example.com", "regular-pass-123");
        login("regular@example.com", "regular-pass-123").andExpect(status().isOk());
        sessions.reset();
        for (int i = 0; i < 5; i++) sessions.registerSession("busy-again-" + i);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void signedInPeopleDoNotTakeSeatsAndGuestsDo() throws Exception {
        accountWithPassword("seatless@example.com", "seatless-pass-123");
        String token = tokenOf(login("seatless@example.com", "seatless-pass-123").andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        assertEquals(0, sessions.getStatus().activeSessions());

        mvc.perform(post("/api/auth/guest")).andExpect(status().isOk());
        assertEquals(1, sessions.getStatus().activeSessions());
    }

    @Test
    void newAccountsAreLimitedPerAddress() throws Exception {
        for (int i = 0; i < 3; i++) {
            googleSays("sub-new-" + i, "new" + i + "@example.com", true);
            choose(google(""), GOOD).andExpect(status().isOk());
            sessions.reset();
        }
        googleSays("sub-new-9", "new9@example.com", true);
        choose(google(""), GOOD).andExpect(status().isTooManyRequests());
    }
}
