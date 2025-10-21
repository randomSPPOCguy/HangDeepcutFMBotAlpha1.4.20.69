# genre_classifier.py
import logging
from typing import List, Tuple, Set

class GenreClassifier:
    """
    Genre and subgenre classification matching JavaScript GenreClassifier.js
    """
    
    ALT_HIP_HOP_SUBGENRES = {
        'Trip Hop', 'Abstract Hip Hop', 'Jazz Rap', 'Experimental Hip Hop',
        'Conscious Hip Hop', 'Underground Hip Hop', 'Boom Bap', 'Lo-Fi Hip Hop',
        'Downtempo', 'Instrumental Hip Hop', 'Turntablism', 'Avant-Garde Hip Hop'
    }
    
    ALT_ROCK_SUBGENRES = {
        'Shoegaze', 'Indie Rock', 'Post-Punk', 'Noise Rock', 'Dream Pop',
        'Gothic Rock', 'Grunge', 'Britpop', 'Post-Rock', 'Math Rock', 'Emo',
        'Slowcore', 'Post-Hardcore', 'Madchester', 'Paisley Underground',
        'Jangle Pop', 'College Rock', 'C86'
    }
    
    ALT_METAL_SUBGENRES = {
        'Nu-Metal'  # ONLY Nu-Metal!
    }
    
    EXCLUDED_ALT_METAL = {
        'Funk Metal', 'Industrial Metal', 'Gothic Metal', 
        'Rap Metal', 'Progressive Metal', 'Alternative Metal (generic)'
    }
    
    def __init__(self):
        logging.info("GenreClassifier initialized with strict genre rules")

    def is_alt_hip_hop_subgenre(self, subgenre: str) -> bool:
        """Check if subgenre belongs to Alternative Hip Hop"""
        if not subgenre or not isinstance(subgenre, str):
            return False
        normalized = subgenre.lower().strip()
        return any(sg.lower() in normalized for sg in self.ALT_HIP_HOP_SUBGENRES)

    def is_alt_rock_subgenre(self, subgenre: str) -> bool:
        """Check if subgenre belongs to Alternative Rock (including Shoegaze)"""
        if not subgenre or not isinstance(subgenre, str):
            return False
        normalized = subgenre.lower().strip()
        return any(sg.lower() in normalized for sg in self.ALT_ROCK_SUBGENRES)

    def is_nu_metal_subgenre(self, subgenre: str) -> bool:
        """Check if subgenre is Nu-Metal (STRICT - only nu-metal variants)"""
        if not subgenre or not isinstance(subgenre, str):
            return False
        normalized = subgenre.lower().strip()
        return 'nu-metal' in normalized or 'nu metal' in normalized or 'nü-metal' in normalized

    def is_target_genre(self, genre: str, subgenre: str = None) -> bool:
        """Check if genre/subgenre combination is in target scope"""
        if not genre:
            return False
        
        normalized_genre = genre.lower().strip()
        
        if 'alternative hip hop' in normalized_genre or 'alt hip hop' in normalized_genre:
            return self.is_alt_hip_hop_subgenre(subgenre) if subgenre else True
        
        if 'alternative rock' in normalized_genre or 'alt rock' in normalized_genre:
            return self.is_alt_rock_subgenre(subgenre) if subgenre else True
        
        if 'alternative metal' in normalized_genre or 'alt metal' in normalized_genre:
            # For Alternative Metal, ONLY accept Nu-Metal subgenre
            return self.is_nu_metal_subgenre(subgenre) if subgenre else False
        
        return False

    def filter_to_target_genres(self, genres: List[str], subgenres: List[str]) -> Tuple[Set[str], Set[str]]:
        """Filter genres/subgenres to only target ones"""
        target_genres = set()
        target_subgenres = set()
        
        for genre in genres:
            normalized = genre.lower().strip()
            
            if 'alternative hip hop' in normalized or 'alt hip hop' in normalized:
                target_genres.add('Alternative Hip Hop')
            elif 'alternative rock' in normalized or 'alt rock' in normalized:
                target_genres.add('Alternative Rock')
            elif 'alternative metal' in normalized or 'alt metal' in normalized:
                # Only add if we have nu-metal subgenres
                if any(self.is_nu_metal_subgenre(sg) for sg in subgenres):
                    target_genres.add('Alternative Metal')
        
        for subgenre in subgenres:
            if self.is_alt_hip_hop_subgenre(subgenre):
                target_subgenres.add(subgenre)
            elif self.is_alt_rock_subgenre(subgenre):
                target_subgenres.add(subgenre)
            elif self.is_nu_metal_subgenre(subgenre):
                target_subgenres.add('Nu-Metal')
        
        return target_genres, target_subgenres

