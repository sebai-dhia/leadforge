package com.leadfinder.usage;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/usage")
@RequiredArgsConstructor
public class UsageController {
    private final UsageService usage;

    /** How much of each daily limit the caller has used, keyed by search, draft and enrich. */
    @GetMapping
    public Map<String, UsageService.Usage> get(@AuthenticationPrincipal Jwt jwt) {
        return usage.all(Long.valueOf(jwt.getSubject()));
    }
}
