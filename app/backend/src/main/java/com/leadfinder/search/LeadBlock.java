package com.leadfinder.search;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** What is kept of a deleted lead: only the keys that recognise the business again. */
@Entity
@Table(name = "lead_blocklist")
@Getter
@Setter
@NoArgsConstructor
public class LeadBlock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "place_id")
    private String placeId;

    @Column(name = "phone_key")
    private String phoneKey;

    @Column(name = "website_host")
    private String websiteHost;

    public LeadBlock(Long userId, String placeId, String phoneKey, String websiteHost) {
        this.userId = userId;
        this.placeId = placeId;
        this.phoneKey = phoneKey;
        this.websiteHost = websiteHost;
    }
}
