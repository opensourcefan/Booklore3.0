package org.fable.model.entity;

import org.fable.convertor.SortConverter;
import org.fable.model.dto.Sort;
import org.fable.model.enums.IconType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.Hibernate;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

@Getter
@Setter
@Builder
@AllArgsConstructor
@NoArgsConstructor
@Entity
@Table(name = "shelf")
public class ShelfEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private FableUserEntity user;

    @Column(name = "name", nullable = false)
    private String name;

    @Convert(converter = SortConverter.class)
    private Sort sort;

    private String icon;

    @Enumerated(EnumType.STRING)
    @Column(name = "icon_type")
    private IconType iconType;

    @Column(name = "is_public", nullable = false)
    @Builder.Default
    private boolean isPublic = false;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "book_shelf_mapping",
            joinColumns = {@JoinColumn(name = "shelf_id")},
            inverseJoinColumns = {@JoinColumn(name = "book_id")}
    )
    @Builder.Default
    private Set<BookEntity> bookEntities = new HashSet<>();

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || Hibernate.getClass(this) != Hibernate.getClass(o)) return false;
        ShelfEntity that = (ShelfEntity) o;
        return id != null && Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Hibernate.getClass(this).hashCode();
    }
}