package com.leadfinder.telegram;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** The person's own Telegram chat: connect it with a one-time link, turn the follow-up reminders off, or disconnect it. */
@RestController
@RequestMapping("/api/profile/telegram")
@RequiredArgsConstructor
public class TelegramController {

    /** timeZone: the browser's, for example Africa/Tunis. */
    public record LinkRequest(String lang, String timeZone) {}

    public record NotifyRequest(@NotNull Boolean notifications) {}

    private final UserRepository users;
    private final TelegramLinks links;

    @GetMapping
    public TelegramLinks.Status status(@AuthenticationPrincipal Jwt jwt) {
        return links.status(load(jwt));
    }

    @PostMapping("/link")
    public TelegramLinks.Link link(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) LinkRequest req) {
        AppUser u = usable(load(jwt));
        return links.newLink(u, req == null ? null : req.lang(), req == null ? null : req.timeZone())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Telegram cannot be reached right now."));
    }

    @PutMapping
    public TelegramLinks.Status setNotifications(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NotifyRequest req) {
        AppUser u = usable(load(jwt));
        links.setNotify(u, req.notifications());
        return links.status(load(jwt));
    }

    @DeleteMapping
    public TelegramLinks.Status disconnect(@AuthenticationPrincipal Jwt jwt) {
        AppUser u = load(jwt);
        links.disconnect(u);
        return links.status(load(jwt));
    }

    private AppUser usable(AppUser u) {
        if (!u.canUseTelegram()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Guest and shared demo accounts cannot connect Telegram.");
        }
        if (!links.status(u).available()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Telegram is not set up on this server.");
        }
        return u;
    }

    private AppUser load(Jwt jwt) {
        return users.findById(Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
}
