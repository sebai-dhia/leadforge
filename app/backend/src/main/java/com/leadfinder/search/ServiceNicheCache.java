package com.leadfinder.search;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "service_niche_cache")
@Getter
@Setter
@NoArgsConstructor
public class ServiceNicheCache {

    @Id
    @Column(name = "service_hash", length = 64)
    private String serviceHash;

    @Column(name = "service_text", nullable = false)
    private String serviceText;

    @Column(name = "niches_csv", nullable = false)
    private String nichesCsv;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    public ServiceNicheCache(String serviceHash, String serviceText, String nichesCsv) {
        this.serviceHash = serviceHash;
        this.serviceText = serviceText;
        this.nichesCsv = nichesCsv;
    }
}
