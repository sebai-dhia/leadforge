package com.leadfinder.admin;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.AuthThrottle;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.settings.RuntimeSettings;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * The admin's configuration: the limits, caps and demo settings saved in the database, and the admin's own email and password.
 * Nothing from .env is shown here: URLs and secrets stay in the file. Admin only (see SecurityConfig).
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminSettingsController {
    private static final int MIN_PASSWORD = 8;

    public record SettingsView(List<RuntimeSettings.Entry> settings) {}

    public record SaveSettings(Map<String, String> values) {}

    public record AccountView(String email) {}

    public record ChangeAccount(@NotBlank @Size(max = 100) String currentPassword,
                                @Email @Size(max = 255) String email,
                                @Size(max = 100) String newPassword) {}

    private final RuntimeSettings settings;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuthThrottle throttle;

    @GetMapping("/settings")
    public SettingsView settings() {
        return view();
    }

    @PutMapping("/settings")
    public SettingsView save(@RequestBody SaveSettings body) {
        if (body == null || body.values() == null || body.values().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to save");
        }
        settings.save(body.values());
        return view();
    }

    @GetMapping("/account")
    public AccountView account(@AuthenticationPrincipal Jwt jwt) {
        return new AccountView(me(jwt).getEmail());
    }

    /** Changes the email, the password or both. The current password is always needed, so a stolen session cannot lock the admin out. */
    @PutMapping("/account")
    public AccountView changeAccount(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangeAccount body, HttpServletRequest request) {
        AppUser admin = me(jwt);
        String newEmail = body.email() == null || body.email().isBlank() ? null : body.email().trim().toLowerCase();
        String newPassword = body.newPassword() == null || body.newPassword().isEmpty() ? null : body.newPassword();
        if (newEmail == null && newPassword == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to change");
        }
        if (newPassword != null && newPassword.length() < MIN_PASSWORD) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The new password needs at least " + MIN_PASSWORD + " characters");
        }
        String ip = request.getRemoteAddr();
        throttle.checkLogin(ip, admin.getEmail());
        if (admin.getPasswordHash() == null || !encoder.matches(body.currentPassword(), admin.getPasswordHash())) {
            throttle.recordLoginFailure(ip, admin.getEmail());
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "The current password is not right");
        }
        throttle.clearLogin(ip, admin.getEmail());
        if (newEmail != null && !newEmail.equals(admin.getEmail())) {
            if (users.existsByEmail(newEmail)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This email is already used by another account");
            }
            admin.setEmail(newEmail);
        }
        if (newPassword != null) admin.setPasswordHash(encoder.encode(newPassword));
        users.save(admin);
        return new AccountView(admin.getEmail());
    }

    private AppUser me(Jwt jwt) {
        return users.findById(Long.valueOf(jwt.getSubject())).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private SettingsView view() {
        return new SettingsView(settings.entries());
    }
}
