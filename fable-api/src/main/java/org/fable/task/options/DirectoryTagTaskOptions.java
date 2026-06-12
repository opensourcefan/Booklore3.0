package org.fable.task.options;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DirectoryTagTaskOptions {
    private Long libraryId;
    private Set<Long> bookIds;

    public boolean hasScopedBooks() {
        return bookIds != null && !bookIds.isEmpty();
    }
}