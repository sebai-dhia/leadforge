package com.leadfinder.admin;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.telegram.TelegramDiagnostics;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Admin only (see SecurityConfig): is the Telegram bot working, and a test message sent right now. */
@RestController
@RequestMapping("/api/admin/telegram")
@RequiredArgsConstructor
public class AdminTelegramController {
    private final TelegramDiagnostics telegram;
    private final UserRepository users;

    @GetMapping
    public TelegramDiagnostics.Status status(@AuthenticationPrincipal Jwt jwt) {
        return telegram.status(admin(jwt));
    }

    @PostMapping("/test")
    public TelegramDiagnostics.TestResult test(@AuthenticationPrincipal Jwt jwt) {
        return telegram.test(admin(jwt));
    }

    private AppUser admin(Jwt jwt) {
        return users.findById(Long.valueOf(jwt.getSubject())).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
}
