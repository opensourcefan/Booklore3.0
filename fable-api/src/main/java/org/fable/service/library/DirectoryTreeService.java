package org.fable.service.library;

import lombok.AllArgsConstructor;
import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.ApiError;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.DirectoryNode;
import org.fable.model.dto.DirectoryRootNode;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.LibraryPathEntity;
import org.fable.repository.BookFileRepository;
import org.fable.repository.LibraryRepository;
import org.fable.repository.UserRepository;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@AllArgsConstructor
public class DirectoryTreeService {

    private final LibraryRepository libraryRepository;
    private final BookFileRepository bookFileRepository;
    private final AuthenticationService authenticationService;
    private final UserRepository userRepository;

    public List<DirectoryRootNode> getTreeForLibrary(long libraryId) {
        LibraryEntity library = libraryRepository.findById(libraryId)
                .orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));

        List<DirectoryRootNode> result = new ArrayList<>();
        for (LibraryPathEntity pathEntity : library.getLibraryPaths()) {
            result.add(buildRootNode(library, pathEntity));
        }
        return result;
    }

    public List<DirectoryRootNode> getTreeForAllUserLibraries() {
        FableUser user = authenticationService.getAuthenticatedUser();
        FableUserEntity userEntity = userRepository.findById(user.getId())
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        List<LibraryEntity> libraries;
        if (userEntity.getPermissions().isPermissionAdmin()) {
            libraries = libraryRepository.findAll();
        } else {
            List<Long> libraryIds = userEntity.getLibraries().stream().map(LibraryEntity::getId).toList();
            libraries = libraryRepository.findByIdIn(libraryIds);
        }

        List<DirectoryRootNode> result = new ArrayList<>();
        for (LibraryEntity library : libraries) {
            for (LibraryPathEntity pathEntity : library.getLibraryPaths()) {
                result.add(buildRootNode(library, pathEntity));
            }
        }
        return result;
    }

    private DirectoryRootNode buildRootNode(LibraryEntity library, LibraryPathEntity pathEntity) {
        List<String> subPaths = bookFileRepository.findDistinctFileSubPathsByLibraryPathId(pathEntity.getId());

        boolean hasRootBooks = subPaths.contains("");
        List<String> nonRootPaths = subPaths.stream()
                .filter(p -> p != null && !p.isEmpty())
                .sorted()
                .toList();

        List<DirectoryNode> children = buildTree(nonRootPaths);

        return DirectoryRootNode.builder()
                .libraryId(library.getId())
                .libraryName(library.getName())
                .libraryPathId(pathEntity.getId())
                .rootPath(pathEntity.getPath())
                .hasRootBooks(hasRootBooks)
                .children(children)
                .build();
    }

    private List<DirectoryNode> buildTree(List<String> subPaths) {
        Map<String, DirectoryNode> nodeMap = new LinkedHashMap<>();

        for (String subPath : subPaths) {
            String[] segments = subPath.split("/");
            StringBuilder current = new StringBuilder();

            for (int i = 0; i < segments.length; i++) {
                String segment = segments[i];
                if (segment.isEmpty()) continue;

                if (i > 0) current.append("/");
                current.append(segment);
                String fullPath = current.toString();

                nodeMap.computeIfAbsent(fullPath, p -> DirectoryNode.builder()
                        .name(segment)
                        .path(fullPath)
                        .children(new ArrayList<>())
                        .build());
            }
        }

        // Wire children to parents
        List<DirectoryNode> roots = new ArrayList<>();
        for (Map.Entry<String, DirectoryNode> entry : nodeMap.entrySet()) {
            String path = entry.getKey();
            DirectoryNode node = entry.getValue();
            int slashIdx = path.lastIndexOf('/');
            if (slashIdx < 0) {
                roots.add(node);
            } else {
                String parentPath = path.substring(0, slashIdx);
                DirectoryNode parent = nodeMap.get(parentPath);
                if (parent != null) {
                    parent.getChildren().add(node);
                } else {
                    roots.add(node);
                }
            }
        }

        // Sort children alphabetically at each level
        sortTree(roots);
        return roots;
    }

    private void sortTree(List<DirectoryNode> nodes) {
        nodes.sort(Comparator.comparing(DirectoryNode::getName, String.CASE_INSENSITIVE_ORDER));
        for (DirectoryNode node : nodes) {
            if (node.getChildren() != null && !node.getChildren().isEmpty()) {
                sortTree(node.getChildren());
            }
        }
    }
}
