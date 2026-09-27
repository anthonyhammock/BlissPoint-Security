def parse_csv_line(line):
    return [cell.strip() for cell in line.split(",")]
