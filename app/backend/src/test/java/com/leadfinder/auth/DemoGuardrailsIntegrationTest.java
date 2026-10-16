package com.leadfinder.auth;

import com.leadfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DemoGuardrailsIntegrationTest extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;
    @Autowired
    ActiveSessionRegistry sessionRegistry;

    @Test
    void demoStatusEndpointReturnsCurrentSessionCounts() throws Exception {
        mvc.perform(get("/api/auth/demo-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maxSessions").value(5))
                .andExpect(jsonPath("$.demoFull").value(false));
    }

    @Test
    void demoUserCannotUpdateProfile() throws Exception {
        AppUser demo = new AppUser();
        demo.setEmail("guest@demo.com");
        demo.setPasswordHash("hash");
        demo.setRole("DEMO_USER");
        demo.setDemo(true);
        AppUser savedDemo = users.save(demo);

        String updatePayload = "{\"offer\":\"New offer\",\"displayName\":\"Hacker\",\"language\":\"en\"}";

        mvc.perform(put("/api/profile")
                        .with(jwt().jwt(j -> j.subject(String.valueOf(savedDemo.getId())).claim("isDemo", true)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updatePayload))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanUpdateProfile() throws Exception {
        AppUser admin = new AppUser();
        admin.setEmail("admin-test@leadforge.dev");
        admin.setPasswordHash("hash");
        admin.setRole("ADMIN");
        admin.setDemo(false);
        AppUser savedAdmin = users.save(admin);

        String updatePayload = "{\"offer\":\"Admin services\",\"displayName\":\"Super Admin\",\"language\":\"en\"}";

        mvc.perform(put("/api/profile")
                        .with(jwt().jwt(j -> j.subject(String.valueOf(savedAdmin.getId())).claim("isDemo", false)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updatePayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Super Admin"));
    }
}
