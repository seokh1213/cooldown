#!/usr/bin/env python3
"""
포로 로고를 최적 크기로 리사이즈하는 스크립트
"""
from PIL import Image
import os
from collections import Counter

def resize_poro_logo(input_path: str, output_dir: str = "public", size: int = 256):
    """포로 로고를 지정된 크기로 리사이즈"""
    if not os.path.exists(input_path):
        print(f"Error: {input_path} 파일을 찾을 수 없습니다.")
        return
    
    # 출력 디렉토리 생성
    os.makedirs(output_dir, exist_ok=True)
    
    # 원본 이미지 로드
    img = Image.open(input_path)
    
    # 투명도가 있는 경우 RGBA 모드로 변환
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # 알파 채널이 있는 경우, 배경을 완전히 투명하게 처리
    if img.mode == 'RGBA':
        width, height = img.size
        pixels = img.load()
        
        # 가장자리 픽셀들의 색상을 수집하여 배경색 추정
        edge_colors = []
        # 상하좌우 가장자리에서 색상 수집
        for x in range(width):
            for y in [0, height-1]:  # 상단과 하단
                r, g, b, a = pixels[x, y]
                if a > 0:  # 완전히 투명하지 않은 경우만
                    edge_colors.append((r, g, b))
        for y in range(height):
            for x in [0, width-1]:  # 좌측과 우측
                r, g, b, a = pixels[x, y]
                if a > 0:
                    edge_colors.append((r, g, b))
        
        # 배경색이 발견되면 투명하게 처리
        if edge_colors:
            # 가장 흔한 색상을 배경색으로 간주
            color_counts = Counter(edge_colors)
            if len(color_counts) > 0:
                bg_color, bg_count = color_counts.most_common(1)[0]
                # 가장자리의 30% 이상이 같은 색이면 배경으로 간주
                if bg_count > len(edge_colors) * 0.3:
                    print(f"배경색 감지: RGB{bg_color}, 가장자리에서 {bg_count}/{len(edge_colors)} 픽셀")
                    # 배경색과 유사한 픽셀을 투명하게 만들기
                    threshold = 15  # 색상 차이 임계값 (더 넓게)
                    transparent_count = 0
                    for x in range(width):
                        for y in range(height):
                            r, g, b, a = pixels[x, y]
                            # 배경색과 유사하면 투명하게
                            color_diff = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])
                            if color_diff < threshold * 3:  # RGB 차이 합계
                                pixels[x, y] = (r, g, b, 0)
                                transparent_count += 1
                    print(f"투명 처리된 픽셀: {transparent_count}")
                else:
                    print("배경색이 명확하지 않아 스킵합니다.")
    
    # 비율 유지하며 리사이즈
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    
    # 출력 경로
    output_path = os.path.join(output_dir, 'poro_logo.png')
    # 투명도 보존하며 저장
    img.save(output_path, 'PNG', optimize=True, compress_level=9)
    print(f"✓ poro_logo.png 생성 완료 ({img.size[0]}x{img.size[1]})")
    
    return output_path

if __name__ == "__main__":
    resize_poro_logo("poro_logo.png", "public", 256)

