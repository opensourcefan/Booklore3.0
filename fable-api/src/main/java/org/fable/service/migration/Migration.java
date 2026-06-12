package org.fable.service.migration;

public interface Migration {
    String getKey();

    String getDescription();

    void execute();
}