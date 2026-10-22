package com.leadfinder.settings;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "app_settings")
@Getter
@Setter
@NoArgsConstructor
public class AppSetting {
    @Id
    @Column(name = "setting_key")
    private String key;

    @Column(name = "setting_value", nullable = false)
    private String value;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public AppSetting(String key, String value) {
        this.key = key;
        this.value = value;
    }
}
