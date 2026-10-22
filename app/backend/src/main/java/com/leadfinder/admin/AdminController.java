package com.leadfinder.admin;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/** Admin only (see SecurityConfig). Reads numbers, and adds or removes accounts. */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {
    private static final int MAX_SIZE = 100;

    public record CreateUser(@NotBlank @Email @Size(max = 255) String email, @Size(max = 100) String displayName, @Size(max = 100) String password) {}

    private final AdminService admin;

    @GetMapping("/overview")
    public AdminService.Overview overview() {
        return admin.overview();
    }

    @GetMapping("/users")
    public AdminService.Page<AdminService.UserRow> users(@RequestParam(defaultValue = "") String q,
                                                         @RequestParam(defaultValue = "") String role,
                                                         @RequestParam(defaultValue = "0") int page,
                                                         @RequestParam(defaultValue = "25") int size) {
        return admin.users(q, role, Math.max(0, page), clamp(size));
    }

    @GetMapping("/searches")
    public AdminService.Page<AdminService.SearchRow> searches(@RequestParam(defaultValue = "FAILED") String status,
                                                              @RequestParam(defaultValue = "0") int page,
                                                              @RequestParam(defaultValue = "25") int size) {
        return admin.searches(status, Math.max(0, page), clamp(size));
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminService.Created createUser(@Valid @RequestBody CreateUser body) {
        return admin.createUser(body.email(), body.displayName(), body.password());
    }

    @DeleteMapping("/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        admin.deleteUser(id, Long.parseLong(jwt.getSubject()));
    }

    private static int clamp(int size) {
        return Math.max(1, Math.min(MAX_SIZE, size));
    }
}
