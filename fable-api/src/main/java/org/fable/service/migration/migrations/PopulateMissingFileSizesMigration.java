package org.fable.service.migration.migrations;

import org.fable.model.entity.BookEntity;
import org.fable.repository.BookRepository;
import org.fable.service.migration.Migration;
import org.fable.util.FileUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class PopulateMissingFileSizesMigration implements Migration {

    private final BookRepository bookRepository;

    @Override
    public String getKey() {
        return "populateFileSizes";
    }

    @Override
    public String getDescription() {
        return "Populate file size for existing books";
    }

    @Override
    public void execute() {
        log.info("Starting migration: {} for books.", getKey());

        List<BookEntity> books = bookRepository.findAllWithMetadataByFileSizeKbIsNull();

        for (BookEntity book : books) {
            Long sizeInKb = FileUtils.getFileSizeInKb(book);
            if (sizeInKb != null) {
                book.getPrimaryBookFile().setFileSizeKb(sizeInKb);
            }
        }

        bookRepository.saveAll(books);

        log.info("Migration '{}' executed successfully for {} books.", getKey(), books.size());
    }
}

