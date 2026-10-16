package com.leadfinder.search;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "leads")
@Getter
@Setter
public class Lead {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_id", nullable = false)
    private Long jobId;

    private String name;
    private String address;
    private String phone;
    private Double rating;
    private Integer reviews;
    private String website;
    private String emails;
    private Integer score;
    private String reason;
    private String subject;

    @Column(name = "email_body")
    private String emailBody;

    private String status = "NEW";
}
