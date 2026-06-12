package org.fable.service.event.aop;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a method to automatically broadcast a WebSocket message upon successful execution.
 * If the method returns a Book or a Collection of Books, the AOP aspect will dispatch
 * the update via the NotificationService.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface BroadcastBookUpdate {
}
