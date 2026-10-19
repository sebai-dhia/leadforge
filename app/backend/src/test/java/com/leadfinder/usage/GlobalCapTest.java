package com.leadfinder.usage;

import com.leadfinder.alert.AlertService;
import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GlobalCapTest {
    private final UsageEventRepository events = mock(UsageEventRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AlertService alerts = mock(AlertService.class);
    private final AppProperties props = new AppProperties("secret-must-be-at-least-32-chars-long", "http://x", "http://x",
            null, new AppProperties.Limits(20, 100, 50, 5, 15, 10), null, null, null,
            new AppProperties.Caps(3, 0, 0), new AppProperties.Alerts("", ""));
    private final UsageService usage = new UsageService(events, props, users, alerts);

    private void user(long id, String role) {
        AppUser u = new AppUser();
        u.setRole(role);
        when(users.findById(id)).thenReturn(Optional.of(u));
    }

    @Test
    void blocksEveryoneButTheAdminOnceTheDemoCapIsReached() {
        user(1, "USER");
        user(2, "ADMIN");
        when(events.countByKindAndCreatedAtAfter(eq("SEARCH"), any())).thenReturn(3L);
        when(events.save(any())).thenAnswer(i -> i.getArgument(0));

        assertThatThrownBy(() -> usage.consume(1L, UsageService.Kind.SEARCH))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("demo has reached its daily limit");
        verify(alerts).send(eq("cap-SEARCH"), anyString());

        usage.consume(2L, UsageService.Kind.SEARCH);
        verify(events).save(any());
    }

    @Test
    void aCapOfZeroIsOff() {
        user(1, "USER");
        when(events.countByKindAndCreatedAtAfter(eq("DRAFT"), any())).thenReturn(10_000L);
        when(events.save(any())).thenAnswer(i -> i.getArgument(0));

        usage.consume(1L, UsageService.Kind.DRAFT);
        verify(events).save(any());
        assertThat(usage.usage(1L, UsageService.Kind.DRAFT).limit()).isEqualTo(100);
    }
}
