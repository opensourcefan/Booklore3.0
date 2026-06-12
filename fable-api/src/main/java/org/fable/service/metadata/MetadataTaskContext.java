package org.fable.service.metadata;

public final class MetadataTaskContext {

    private static final ThreadLocal<TaskContext> CURRENT = new ThreadLocal<>();

    private MetadataTaskContext() {
    }

    public static void set(String taskId, int completed, int total, boolean review) {
        CURRENT.set(new TaskContext(taskId, completed, total, review));
    }

    public static TaskContext get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }

    public record TaskContext(String taskId, int completed, int total, boolean review) {
    }
}