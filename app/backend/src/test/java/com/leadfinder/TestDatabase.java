package com.leadfinder;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/** Makes sure the database used by the integration tests exists. It lives in the development Postgres. */
public final class TestDatabase {
    public static final String NAME = "leadfinder_test";

    private static boolean ready;

    private TestDatabase() {}

    public static synchronized void ensure() {
        if (ready) return;
        String admin = "jdbc:postgresql://localhost:5433/postgres";
        try (Connection c = DriverManager.getConnection(admin, "leadfinder", "leadfinder");
             Statement s = c.createStatement()) {
            try (ResultSet rs = s.executeQuery("select 1 from pg_database where datname = '" + NAME + "'")) {
                if (!rs.next()) {
                    s.execute("create database " + NAME);
                }
            }
            ready = true;
        } catch (SQLException e) {
            throw new IllegalStateException(
                    "The integration tests need the development Postgres: run 'docker compose up -d' in the app folder.", e);
        }
    }
}
