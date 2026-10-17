package com.leadfinder.auth;

import com.leadfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GoogleSignInIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;

    private static final String BODY = "{\"credential\":\"fake-id-token\"}";

    private void googleSays(String sub, String email, boolean verified) {
        when(google.verify(anyString())).thenReturn(new GoogleTokenVerifier.GoogleIdentity(sub, email, verified, "Sam Example"));
    }

    @Test
    void firstSignInCreatesAnEditableAccountWithoutPassword() throws Exception {
        googleSays("sub-1", "Sam@Example.com", true);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("sam@example.com"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.isDemo").value(false))
                .andExpect(jsonPath("$.token").isNotEmpty());
        AppUser u = users.findByEmail("sam@example.com").orElseThrow();
        assertEquals("sub-1", u.getGoogleSub());
        assertEquals(null, u.getPasswordHash());
        assertEquals("Sam Example", u.getDisplayName());
    }

    @Test
    void secondSignInReusesTheSameAccount() throws Exception {
        googleSays("sub-2", "again@example.com", true);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk());
        sessions.reset();
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk());
        assertEquals(1, users.count());
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
        googleSays("sub-3", "nope@example.com", false);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
        assertEquals(0, users.count());
    }

    @Test
    void anExistingPasswordAccountIsNeverTakenOverByGoogle() throws Exception {
        AppUser existing = new AppUser();
        existing.setEmail("taken@example.com");
        existing.setPasswordHash("hash");
        users.save(existing);
        googleSays("sub-4", "taken@example.com", true);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict());
        assertEquals(null, users.findByEmail("taken@example.com").orElseThrow().getGoogleSub());
    }

    @Test
    void googleAccountsCannotSignInWithAPassword() throws Exception {
        googleSays("sub-5", "g@example.com", true);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"g@example.com\",\"password\":\"anything-long\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void whenAllSeatsAreTakenANewGoogleUserGetsNoAccount() throws Exception {
        for (int i = 0; i < 5; i++) sessions.registerSession("busy-" + i);
        googleSays("sub-6", "late@example.com", true);
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isTooManyRequests());
        assertTrue(users.findByEmail("late@example.com").isEmpty());
    }
}
