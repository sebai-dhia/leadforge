package com.leadfinder.usage;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "usage_events")
@Getter
@Setter
@NoArgsConstructor
public class UsageEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Empty once the account was deleted (idle guests): the use still counts toward the caps for all users. */
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false)
    private String kind;

    /** Given back because the action failed. Not counted against any limit, but kept for the admin. */
    @Column(nullable = false)
    private boolean refunded = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public UsageEvent(Long userId, String kind) {
        this.userId = userId;
        this.kind = kind;
    }
}
