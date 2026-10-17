package com.leadfinder.auth;

import com.leadfinder.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

/** Deletes guest accounts, with their leads and searches, once nobody has used them for a while. */
@Component
@RequiredArgsConstructor
@Slf4j
public class GuestCleanup {

    private final UserRepository users;
    private final ActiveSessionRegistry sessions;
    private final AppProperties props;

    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void sweep() {
        int idle = props.demo() != null ? props.demo().idleMinutes() : 15;
        Instant cutoff = Instant.now().minus(Duration.ofMinutes(idle));
        Set<Long> active = sessions.activeUserIds();
        List<AppUser> idleGuests = users.findByRoleAndCreatedAtBefore("GUEST", cutoff).stream()
                .filter(g -> !active.contains(g.getId()))
                .toList();
        if (!idleGuests.isEmpty()) {
            users.deleteAll(idleGuests);
            log.info("Deleted {} idle guest account(s)", idleGuests.size());
        }
    }
}
