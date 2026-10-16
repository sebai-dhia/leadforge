package com.leadfinder.search;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;

/** Records that a search found a lead. */
@Entity
@Table(name = "search_leads")
@IdClass(SearchLead.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SearchLead {
    @Id
    @Column(name = "job_id")
    private Long jobId;

    @Id
    @Column(name = "lead_id")
    private Long leadId;

    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long jobId;
        private Long leadId;
    }
}
