package org.fable.util;

import org.fable.model.dto.request.FetchMetadataRequest;
import org.fable.model.enums.MetadataProvider;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

public class BookUtilsTest {

    @Test
    public void testCleanFetchMetadataRequest() {
        FetchMetadataRequest req = new FetchMetadataRequest();
        
        req.setTitle("Project Hail Mary - Andy Weir (2022)");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("Project Hail Mary", req.getTitle());
        assertEquals("Andy Weir", req.getAuthor());

        req = new FetchMetadataRequest();
        req.setTitle("The Lion, The Witch, and The Wardrobe - C.S. Lewis");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("The Lion, The Witch, and The Wardrobe", req.getTitle());
        assertEquals("C.S. Lewis", req.getAuthor());

        req = new FetchMetadataRequest();
        req.setTitle("1984 (1949)");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("1984", req.getTitle());
        assertNull(req.getAuthor());

        req = new FetchMetadataRequest();
        req.setTitle("Normal Title");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("Normal Title", req.getTitle());
        assertNull(req.getAuthor());

        req = new FetchMetadataRequest();
        req.setTitle("Some Book [2022]");
        req.setAuthor("Famous Author");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("Some Book", req.getTitle());
        assertEquals("Famous Author", req.getAuthor());

        req = new FetchMetadataRequest();
        req.setTitle("Stitched Terror 001 (2019) (Digital) (Mephisto-Empire)");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("Stitched Terror #1", req.getTitle());
        assertNull(req.getAuthor());

        req = new FetchMetadataRequest();
        req.setTitle("Stitched Terror 001");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("Stitched Terror #1", req.getTitle());

        req = new FetchMetadataRequest();
        req.setTitle("Stitched Terror 01");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("Stitched Terror #1", req.getTitle());
        
        req = new FetchMetadataRequest();
        req.setTitle("Stitched Terror #001");
        BookUtils.cleanFetchMetadataRequest(req);
        assertEquals("Stitched Terror #1", req.getTitle());

        req = new FetchMetadataRequest();
        req.setTitle("comicvine - test");
        BookUtils.cleanFetchMetadataRequest(req, MetadataProvider.Comicvine);
        assertEquals("comicvine test", req.getTitle());
        assertNull(req.getAuthor());

        req = new FetchMetadataRequest();
        req.setTitle("comicvine-test");
        BookUtils.cleanFetchMetadataRequest(req, MetadataProvider.Comicvine);
        assertEquals("comicvine-test", req.getTitle());
        assertNull(req.getAuthor());
    }
}
