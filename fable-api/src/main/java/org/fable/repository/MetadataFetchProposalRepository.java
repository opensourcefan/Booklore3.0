package org.fable.repository;

import org.fable.model.entity.MetadataFetchProposalEntity;
import org.fable.model.enums.FetchedMetadataProposalStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MetadataFetchProposalRepository extends JpaRepository<MetadataFetchProposalEntity, Long> {

    @Query("""
            select p from MetadataFetchProposalEntity p
            join fetch p.job j
            where p.status = :status
            order by p.fetchedAt desc
            """)
    List<MetadataFetchProposalEntity> findAllByStatusWithJob(@Param("status") FetchedMetadataProposalStatus status);
}
