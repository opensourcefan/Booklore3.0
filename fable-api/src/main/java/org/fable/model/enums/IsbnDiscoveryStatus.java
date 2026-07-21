package org.fable.model.enums;

/**
 * Durable ISBN discovery exceptions shown on book covers in the Staged inbox.
 * A null status means there is no recorded ISBN discovery problem.
 */
public enum IsbnDiscoveryStatus {
    NOT_FOUND,
    ERROR
}
